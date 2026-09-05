import pandas as pd

# =========================
# CARGAR MUESTRA
# =========================

df = pd.read_csv("sample.csv", low_memory=False)

print("===================================")
print("RESUMEN GENERAL")
print("===================================")

print("Filas:", df.shape[0])
print("Columnas:", df.shape[1])

print("\n===================================")
print("TIPOS DE DATOS")
print("===================================")

print(df.dtypes)

print("\n===================================")
print("VALORES FALTANTES")
print("===================================")

missing = pd.DataFrame({
    "missing_count": df.isnull().sum(),
    "missing_pct": (df.isnull().sum() / len(df) * 100).round(2)
})

missing = missing.sort_values(
    "missing_pct",
    ascending=False
)

print(missing)

# Guardar resultados
missing.to_csv(
    "missing_values.csv"
)


print("\n===================================")
print("DUPLICADOS")
print("===================================")

duplicados = df.duplicated().sum()

print("Filas duplicadas:", duplicados)

if "ID" in df.columns:
    ids_duplicados = df["ID"].duplicated().sum()
    print("IDs duplicados:", ids_duplicados)


print("\n===================================")
print("SEVERITY")
print("===================================")

if "Severity" in df.columns:

    print(df["Severity"].value_counts().sort_index())

    severity_invalidos = (
        ~df["Severity"].isin([1, 2, 3, 4])
        & df["Severity"].notna()
    ).sum()

    print(
        "Valores de Severity fuera de 1-4:",
        severity_invalidos
    )


print("\n===================================")
print("VARIABLES NUMÉRICAS")
print("===================================")

print(
    df.describe().T
)

df.describe().T.to_csv(
    "numeric_summary.csv"
)


print("\n===================================")
print("VALIDACIONES")
print("===================================")

# Coordenadas
if "Start_Lat" in df.columns:

    lat_invalidas = (
        (df["Start_Lat"] < -90)
        | (df["Start_Lat"] > 90)
    ).sum()

    print(
        "Latitudes inválidas:",
        lat_invalidas
    )


if "Start_Lng" in df.columns:

    lng_invalidas = (
        (df["Start_Lng"] < -180)
        | (df["Start_Lng"] > 180)
    ).sum()

    print(
        "Longitudes inválidas:",
        lng_invalidas
    )


# Humedad
if "Humidity(%)" in df.columns:

    humedad_invalida = (
        (df["Humidity(%)"] < 0)
        | (df["Humidity(%)"] > 100)
    ).sum()

    print(
        "Valores inválidos de humedad:",
        humedad_invalida
    )


# Distancia
if "Distance(mi)" in df.columns:

    distancia_negativa = (
        df["Distance(mi)"] < 0
    ).sum()

    print(
        "Distancias negativas:",
        distancia_negativa
    )


# Visibilidad
if "Visibility(mi)" in df.columns:

    visibilidad_negativa = (
        df["Visibility(mi)"] < 0
    ).sum()

    print(
        "Visibilidad negativa:",
        visibilidad_negativa
    )


# Velocidad del viento
if "Wind_Speed(mph)" in df.columns:

    viento_negativo = (
        df["Wind_Speed(mph)"] < 0
    ).sum()

    print(
        "Velocidad de viento negativa:",
        viento_negativo
    )


# Precipitación
if "Precipitation(in)" in df.columns:

    precipitacion_negativa = (
        df["Precipitation(in)"] < 0
    ).sum()

    print(
        "Precipitación negativa:",
        precipitacion_negativa
    )


print("\n===================================")
print("PROCESO FINALIZADO")
print("===================================")

print(
    "Archivos generados:"
)

print(
    "- missing_values.csv"
)

print(
    "- numeric_summary.csv"
)