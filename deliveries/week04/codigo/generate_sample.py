import pandas as pd

# =========================
# CONFIGURACIÓN
# =========================

archivo = "US_Accidents_March23.csv"
archivo_salida = "sample.csv"

tamano_muestra = 100000
tamano_chunk = 100000
semilla = 5343


# =========================
# LECTURA POR CHUNKS
# =========================

print("Iniciando lectura del dataset por chunks...")

muestras = []
total_filas = 0

for numero_chunk, chunk in enumerate(
        pd.read_csv(
            archivo,
            chunksize=tamano_chunk,
            low_memory=False
        ),
        start=1
):

    total_filas += len(chunk)

    # Tomamos una pequeña muestra aleatoria de cada chunk
    muestra_chunk = chunk.sample(
        frac=0.02,
        random_state=semilla + numero_chunk
    )

    muestras.append(muestra_chunk)

    print(
        f"Chunk {numero_chunk} procesado | "
        f"Filas procesadas: {total_filas:,}"
    )


# =========================
# UNIR MUESTRAS
# =========================

print("\nUniendo muestras...")

sample = pd.concat(
    muestras,
    ignore_index=True
)


# =========================
# MUESTRA FINAL
# =========================

# Si obtuvimos más de 100,000 filas,
# seleccionamos exactamente 100,000
if len(sample) > tamano_muestra:

    sample = sample.sample(
        n=tamano_muestra,
        random_state=semilla
    )


# =========================
# GUARDAR
# =========================

sample.to_csv(
    archivo_salida,
    index=False
)

print("\n-----------------------------")
print("PROCESO TERMINADO")
print("-----------------------------")

print(f"Filas originales procesadas: {total_filas:,}")
print(f"Filas de la muestra: {len(sample):,}")
print(f"Columnas: {len(sample.columns)}")
print(f"Archivo generado: {archivo_salida}")