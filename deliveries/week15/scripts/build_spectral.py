"""Agrupa estados y condados por la forma de su serie temporal con procesamiento espectral de grafos.

Para cada área se arma la serie trimestral del índice ajustado (Severity >= 3 observados / esperados según
la fuente y el año, igual que en el dashboard). Las series se comparan por correlación, se arma un grafo de
k vecinos con pesos autoajustados (Zelnik-Manor y Perona, 2004) y se usan los vectores propios del
laplaciano normalizado para:
  * las coordenadas x, y del scatterplot (Laplacian eigenmaps, Belkin y Niyogi, 2003);
  * los grupos (spectral clustering, Ng, Jordan y Weiss, 2002), con k elegido por el mayor salto espectral.

Uso:  python scripts/build_spectral.py
Lee data/w12/usa.json y data/w12/states/*.json; escribe data/w12/spectral.json.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

APP_DIR = Path(__file__).resolve().parents[1]
W12 = APP_DIR / "data" / "w12"
SUMMARY_ROOT = APP_DIR.parents[1] / "week10" / "VIZZU_7M_mapbox_deckgl" / "data" / "processed" / "states"

QUARTER = 3        # meses por punto de la serie: por mes, la mayoría de condados es ruido
SHRINK = 8.0       # casos ficticios "en lo esperado" por trimestre: acerca a 1x los trimestres con pocos datos
MIN_EXPECTED = {"states": 0, "counties": 100}   # Severity >= 3 esperados en todo el periodo para entrar
NEIGHBORS = {"states": 6, "counties": 12}
GROUPS = {"states": (2, 5), "counties": (3, 6)}
SEED = 7


def national_rates(T):
    """Proporción Severity >= 3 por fuente y año en todo el país (igual que DataCore.nationalRates)."""
    s, m, t, h = (np.asarray(T[k]) for k in "smth")
    year = m // 12
    tt = np.zeros((s.max() + 1, year.max() + 1))
    hh = np.zeros_like(tt)
    np.add.at(tt, (s, year), t)
    np.add.at(hh, (s, year), h)
    return np.divide(hh, tt, out=np.zeros_like(hh), where=tt > 0)


def area_series(areas, rates, n_months):
    """Observados y esperados por área y trimestre."""
    a, s, m, t, h = (np.asarray(areas[k]) for k in ("a", "s", "m", "t", "h"))
    n_areas, n_q = len(areas["names"]), int(np.ceil(n_months / QUARTER))
    keep = m < n_months
    a, s, m, t, h = a[keep], s[keep], m[keep], t[keep], h[keep]
    expected = t * rates[s, m // 12]
    obs = np.zeros((n_areas, n_q))
    exp = np.zeros((n_areas, n_q))
    np.add.at(obs, (a, m // QUARTER), h)
    np.add.at(exp, (a, m // QUARTER), expected)
    return obs, exp


def shrunk_index(obs, exp):
    return (obs + SHRINK) / (exp + SHRINK)


def spectral(series, k_neighbors, group_range):
    """Grafo kNN sobre la forma de las series -> coordenadas 2D y grupos."""
    x = np.log(series)
    x = x - x.mean(axis=1, keepdims=True)
    sd = x.std(axis=1, keepdims=True)
    x = x / np.where(sd > 0, sd, 1)
    n = len(x)
    corr = np.clip(x @ x.T / x.shape[1], -1, 1)
    dist = np.sqrt(np.maximum(0, 2 * (1 - corr)))     # distancia euclidiana entre series z-normalizadas

    k = min(k_neighbors, n - 1)
    order = np.argsort(dist, axis=1)
    knn = order[:, 1:k + 1]
    sigma = dist[np.arange(n), knn[:, -1]] + 1e-9     # escala local: distancia al k-ésimo vecino
    W = np.zeros((n, n))
    rows = np.repeat(np.arange(n), k)
    cols = knn.ravel()
    W[rows, cols] = np.exp(-dist[rows, cols] ** 2 / (sigma[rows] * sigma[cols]))
    W = np.maximum(W, W.T)                            # vecinos en cualquiera de los dos sentidos
    W += 1e-6 * (1 - np.eye(n))                       # garantiza un grafo conexo

    d = W.sum(axis=1)
    d_inv = 1 / np.sqrt(d)
    L = np.eye(n) - d_inv[:, None] * W * d_inv[None, :]
    values, vectors = np.linalg.eigh(L)

    lo, hi = group_range
    gaps = np.diff(values[: hi + 1])
    n_groups = int(lo + np.argmax(gaps[lo - 1: hi]))  # el mayor salto entre lambda_k y lambda_{k+1}

    coords = d_inv[:, None] * vectors[:, 1:3]         # vectores del laplaciano de paseo aleatorio
    coords = (coords - coords.mean(axis=0)) / coords.std(axis=0)

    U = vectors[:, :n_groups]
    U = U / np.linalg.norm(U, axis=1, keepdims=True)
    labels = kmeans(U, n_groups)
    return coords, labels, values[: hi + 2], n_groups


def kmeans(X, k, restarts=20):
    rng = np.random.default_rng(SEED)
    best, best_cost = None, np.inf
    for _ in range(restarts):
        centers = X[[rng.integers(len(X))]]
        while len(centers) < k:                       # k-means++
            d2 = ((X[:, None] - centers[None]) ** 2).sum(-1).min(1)
            centers = np.vstack([centers, X[rng.choice(len(X), p=d2 / d2.sum())]])
        for _ in range(100):
            labels = ((X[:, None] - centers[None]) ** 2).sum(-1).argmin(1)
            new = np.array([X[labels == j].mean(0) if (labels == j).any() else centers[j] for j in range(k)])
            if np.allclose(new, centers):
                break
            centers = new
        cost = ((X - centers[labels]) ** 2).sum()
        if cost < best_cost:
            best, best_cost = labels, cost
    return best


def relabel(labels, sizes_first=True):
    """Grupo 0 = el más grande, para colores estables entre corridas."""
    order = np.argsort(-np.bincount(labels))
    remap = np.empty_like(order)
    remap[order] = np.arange(len(order))
    return remap[labels]


def build(level, ids, names, extra, obs, exp):
    keep = exp.sum(axis=1) >= MIN_EXPECTED[level]
    keep &= exp.sum(axis=1) > 0
    idx = np.flatnonzero(keep)
    series = shrunk_index(obs[idx], exp[idx])
    coords, labels, eig, n_groups = spectral(series, NEIGHBORS[level], GROUPS[level])
    labels = relabel(labels)

    points = []
    for row, i in enumerate(idx):
        point = {"id": ids[i], "name": names[i], "x": round(float(coords[row, 0]), 4), "y": round(float(coords[row, 1]), 4),
                 "g": int(labels[row]), "h": int(obs[i].sum()), "q": [round(float(v), 3) for v in series[row]]}
        point.update(extra[i])
        points.append(point)
    groups = []
    for g in range(n_groups):
        member = series[labels == g]
        groups.append({"g": g, "n": int(len(member)),
                       "mean": [round(float(v), 3) for v in np.exp(np.log(member).mean(0))]})
    print(f"{level}: {len(points)} áreas (de {len(ids)}), {n_groups} grupos, tamaños {[x['n'] for x in groups]}")
    return {"points": points, "groups": groups, "eigenvalues": [round(float(v), 4) for v in eig],
            "neighbors": NEIGHBORS[level], "min_expected": MIN_EXPECTED[level]}


def county_names(state):
    path = SUMMARY_ROOT / state / "counties_summary.json"
    if not path.exists():
        return {}
    return {row["county_slug"]: row["County"] for row in json.loads(path.read_text(encoding="utf-8"))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(W12 / "spectral.json"))
    args = parser.parse_args()

    usa = json.loads((W12 / "usa.json").read_text(encoding="utf-8"))
    months = usa["meta"]["months"]
    rates = national_rates(usa["T"])

    obs, exp = area_series(usa["areas"], rates, len(months))
    codes = usa["areas"]["names"]
    states = build("states", codes, codes, [{} for _ in codes], obs, exp)

    ids, names, extra, all_obs, all_exp = [], [], [], [], []
    for code in codes:
        data = json.loads((W12 / "states" / f"{code}.json").read_text(encoding="utf-8"))
        o, e = area_series(data["areas"], rates, len(months))
        labels = county_names(code)
        for i, slug in enumerate(data["areas"]["names"]):
            ids.append(f"{code}/{slug}")
            names.append(labels.get(slug, slug.replace("_", " ").title()))
            extra.append({"state": code, "slug": slug})
        all_obs.append(o)
        all_exp.append(e)
    counties = build("counties", ids, names, extra, np.vstack(all_obs), np.vstack(all_exp))

    quarters = [months[i] for i in range(0, len(months), QUARTER)]
    out = {"quarters": quarters, "shrink": SHRINK, "states": states, "counties": counties}
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"escrito {args.out} ({Path(args.out).stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
