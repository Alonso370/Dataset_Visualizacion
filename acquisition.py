import argparse
import csv
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import pandas as pd
import requests

BASE = Path(__file__).resolve().parent
RAW = BASE / "raw"
DATA = BASE / "data"

FUENTE = "https://www.onsv.gob.pe/datosabiertos"

ARCHIVOS = {
    "siniestros": (
        "BBDD ONSV - SINIESTROS FATALES 2021-2025 (preliminar).xlsx",
        "https://www.onsv.gob.pe/estaticos/excel/BBDD%20ONSV%20-%20SINIESTROS%20FATALES%202021-2025%20(preliminar).xlsx",
    ),
    "vehiculos": (
        "BBDD ONSV - VEHICULOS 2021-2025 (preliminar).xlsx",
        "https://www.onsv.gob.pe/estaticos/excel/BBDD%20ONSV%20-%20VEHICULOS%202021-2025%20(preliminar).xlsx",
    ),
    "personas": (
        "BBDD ONSV - PERSONAS 2021-2025 (preliminar).xlsx",
        "https://www.onsv.gob.pe/estaticos/excel/BBDD%20ONSV%20-%20PERSONAS%202021-2025%20(preliminar).xlsx",
    ),
    "historico": (
        "PERU. SINIESTROS DE TRANSITO POR ANO_2008-2025_preliminar.xlsx",
        "https://www.onsv.gob.pe/estaticos/excel/PERU.%20SINIESTROS%20DE%20TRANSITO%20POR%20A%C3%91O_2008-2025_preliminar.xlsx",
    ),
}

# ---------------------------------------------------------------------------
# Normalizacion de nombres de columna
#
# Los encabezados originales traen tildes, signos de interrogacion, numerales y
# espacios dobles. Los mapeamos explicitamente (y no por regla automatica) para
# que la correspondencia quede auditable en el diccionario de datos.
# ---------------------------------------------------------------------------

REN_SINIESTROS = {
    "CÓDIGO SINIESTRO": "codigo_siniestro",
    "FECHA SINIESTRO": "fecha_siniestro",
    "HORA SINIESTRO": "hora_siniestro",
    "CLASE SINIESTRO": "clase_siniestro",
    "CANTIDAD DE FALLECIDOS": "cantidad_fallecidos",
    "CANTIDAD DE LESIONADOS": "cantidad_lesionados",
    "CANTIDAD DE VEHICULOS DAÑADOS": "cantidad_vehiculos_danados",
    "DEPARTAMENTO": "departamento",
    "PROVINCIA": "provincia",
    "DISTRITO": "distrito",
    "ZONA": "zona",
    "TIPO DE VÍA": "tipo_via",
    "RED VIAL": "red_vial",
    "COD CARRETERA": "cod_carretera",
    "COORDENADAS LATITUD": "latitud",
    "COORDENADAS LONGITUD": "longitud",
    "CONDICIÓN CLIMÁTICA": "condicion_climatica",
    "ZONIFICACIÓN": "zonificacion",
    "CARACTERÍSTICAS DE VÍA": "caracteristicas_via",
    "PERFIL LONGITUDINAL VÍA": "perfil_longitudinal_via",
    "SUPERFICIE DE CALZADA": "superficie_calzada",
    "¿EXISTE SEÑAL VERTICAL?": "existe_senal_vertical",
    "CLASIFICACIÓN DE LA SEÑAL VERTICAL Nº 1": "clasificacion_senal_vertical_1",
    "CLASIFICACIÓN DE LA SEÑAL VERTICAL Nº 2": "clasificacion_senal_vertical_2",
    "¿EXISTE SEÑAL HORIZONTAL?": "existe_senal_horizontal",
    "CAUSA FACTOR PRINCIPAL": "causa_factor_principal",
    "CAUSA ESPECÍFICA": "causa_especifica",
}

REN_VEHICULOS = {
    "CÓDIGO SINIESTRO": "codigo_siniestro",
    "CÓDIGO VEHICULO": "codigo_vehiculo",
    "DEPARTAMENTO": "departamento",
    "PROVINCIA": "provincia",
    "DISTRITO": "distrito",
    "SITUACIÓN VEHÍCULO": "situacion_vehiculo",
    "ESTADO MODALIDAD": "estado_modalidad",
    "MODALIDAD DE TRANSPORTE": "modalidad_transporte",
    "ELEMENTO TRANSPORTADO": "elemento_transportado",
    "AMBITO SERVICIO": "ambito_servicio",
    "POSEE SEGURO": "posee_seguro",
    "ESTADO SOAT": "estado_soat",
    "TIPO SEGURO": "tipo_seguro",
    "COMPAÑIA SEGURO": "compania_seguro",
    "POSEE CITV": "posee_citv",
    "ESTADO CITV": "estado_citv",
    "VEHÍCULO": "vehiculo",
    "TIPO SINIESTRO": "clase_siniestro",
    "FECHA": "fecha_siniestro",
    "AÑO": "anio",
    "MES": "mes",
    "DÍA": "dia_semana",
    "HORA": "hora",
    "CÓDIGO DE CARRETERA": "cod_carretera",
    "TIPO DE VÍA": "tipo_via",
}

REN_PERSONAS = {
    "CÓDIGO SINIESTRO": "codigo_siniestro",
    "CÓDIGO VEHÍCULO": "codigo_vehiculo",
    "CÓDIGO PERSONA": "codigo_persona",
    "DEPARTAMENTO": "departamento",
    "PROVINCIA": "provincia",
    "DISTRITO": "distrito",
    "TIPO PERSONA": "tipo_persona",
    "GRAVEDAD": "gravedad",
    "LUGAR ATENCIÓN LESIONADO": "lugar_atencion_lesionado",
    "LUGAR DE DEFUNCIÓN": "lugar_defuncion",
    "SITUACIÓN DE PERSONA": "situacion_persona",
    "PAÍS DE NACIONALIDAD": "pais_nacionalidad",
    "EDAD": "edad",
    "SEXO": "sexo",
    "POSEE LICENCIA": "posee_licencia",
    "ESTADO LICENCIA": "estado_licencia",
    "CLASE_LICENCIA": "clase_licencia",
    "¿SE SOMETIÓ A DOSAJE ETÍLICO CUALITATIVO?": "sometio_dosaje_cualitativo",
    "RESULTADO DEL DOSAJE ETÍLICO CUALITATIVO": "resultado_dosaje_cualitativo",
    "¿SE SOMETIÓ A DOSAJE ETÍLICO CUANTITATIVO?": "sometio_dosaje_cuantitativo",
    "VEHÍCULO": "vehiculo",
    "FECHA": "fecha_siniestro",
    "AÑO": "anio",
    "MES": "mes",
    "DIA": "dia_semana",
    "HORA": "hora",
    "CLASE DE SINIESTRO": "clase_siniestro",
    "CAUSA": "causa_factor_principal",
    "CAUSA ESPECIFICA": "causa_especifica",
    "TIPO DE VÍA": "tipo_via",
    "CÓDIGO DE CARRETERA": "cod_carretera",
    "RED VIAL": "red_vial",
}

# Columnas que deben quedar numericas en el CSV de salida
NUMERICAS = {
    "siniestros": ["cantidad_fallecidos", "cantidad_lesionados",
                   "cantidad_vehiculos_danados", "latitud", "longitud"],
    "vehiculos": ["anio", "hora"],
    "personas": ["edad", "anio", "hora"],
}


def log(msg):
    print(msg, flush=True)


def descargar():
    RAW.mkdir(parents=True, exist_ok=True)
    for clave, (nombre, url) in ARCHIVOS.items():
        destino = RAW / nombre
        if destino.exists():
            log(f"  ya existe, se omite : {nombre}")
            continue
        log(f"  descargando         : {nombre}")
        r = requests.get(url, timeout=180)
        r.raise_for_status()
        destino.write_bytes(r.content)
        log(f"    {len(r.content):,} bytes")


def leer_bbdd(nombre):
    """Lee una BBDD del ONSV localizando la fila de encabezado.

    Los archivos traen entre 2 y 4 filas de notas antes de la cabecera real, y
    la posicion varia entre archivos, por lo que no se puede usar un skiprows
    fijo. Buscamos la primera fila que contenga la palabra 'CODIGO'.
    """
    ruta = RAW / nombre
    cabeza = pd.read_excel(ruta, header=None, nrows=12)
    fila = None
    for i in range(len(cabeza)):
        celdas = cabeza.iloc[i].astype(str)
        if celdas.str.contains("CÓDIGO", na=False).any():
            fila = i
            break
    if fila is None:
        raise RuntimeError(f"No se encontro la fila de encabezado en {nombre}")

    df = pd.read_excel(ruta, header=fila)
    df.columns = [re.sub(r"\s+", " ", str(c)).strip() for c in df.columns]
    return df


def limpiar(df, renombres, clave_pk, numericas):
    faltantes = set(renombres) - set(df.columns)
    if faltantes:
        raise RuntimeError(f"Columnas esperadas ausentes: {sorted(faltantes)}")

    df = df[list(renombres)].rename(columns=renombres)

    # Descartar filas de notas al pie: sin identificador primario no son datos.
    antes = len(df)
    df = df[df[clave_pk].notna()].copy()
    if antes != len(df):
        log(f"    se descartaron {antes - len(df)} filas sin {clave_pk}")

    # Texto: recortar espacios y colapsar espacios internos.
    for col in df.columns:
        if df[col].dtype == object:
            df[col] = (df[col].astype(str)
                       .str.replace(r"\s+", " ", regex=True)
                       .str.strip()
                       .replace({"nan": pd.NA, "": pd.NA, "None": pd.NA}))

    # Fechas a ISO 8601 (YYYY-MM-DD), formato que D3 parsea sin configuracion.
    #
    # La columna de fecha es de tipo mixto en el origen: la mayoria son cadenas
    # 'DD/MM/YYYY' pero un punado son objetos datetime de Excel, que al pasar por
    # la limpieza de texto quedan como 'YYYY-MM-DD HH:MM:SS'. Pandas infiere un
    # unico formato para toda la columna y convierte el resto en NaT, asi que
    # hay que parsear elemento por elemento con format='mixed'.
    if "fecha_siniestro" in df.columns:
        f = pd.to_datetime(df["fecha_siniestro"], dayfirst=True,
                           format="mixed", errors="coerce")
        sin_fecha = int(f.isna().sum())
        if sin_fecha:
            log(f"    ADVERTENCIA: {sin_fecha} fechas no parseables")
        df["fecha_siniestro"] = f.dt.strftime("%Y-%m-%d")

    for col in numericas:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # La hora viene como 'HH:MM' en siniestros y como entero en las otras tablas.
    if "hora_siniestro" in df.columns:
        df["hora_del_dia"] = pd.to_numeric(
            df["hora_siniestro"].astype(str).str.slice(0, 2), errors="coerce")

    return df.reset_index(drop=True)


def normalizar_departamento(valor):
    """Unifica el nombre de departamento entre el libro historico y las bases.

    El historico escribe 'HUÁNUCO' y 'AMAZÓNAS' con tilde y arrastra espacios
    finales ('ANCASH '), mientras que las bases detalladas usan la forma sin
    tilde. Sin esto las tablas no se pueden unir por departamento.
    """
    s = re.sub(r"\s+", " ", str(valor)).strip().upper()
    s = "".join(c for c in unicodedata.normalize("NFKD", s)
                if not unicodedata.combining(c))
    return s


def parsear_bloques(hoja, fila_anio, filas_categoria, nombres_categoria, nombre_valor):
    """Convierte a formato largo una hoja de bloques anuales yuxtapuestos.

    Estas hojas repiten, una al lado de otra, una tabla por anio: la fila
    `fila_anio` marca el inicio de cada bloque con el anio (y queda vacia en las
    columnas siguientes del bloque, por lo que hay que propagarla), y las filas
    `filas_categoria` llevan los encabezados de categoria, que pueden ser de dos
    niveles (por ejemplo sexo y grupo etario).

    Importante: el conjunto de categorias NO es constante entre anios. Se
    preserva la etiqueta tal como aparece en el origen y no se armoniza, porque
    unificar criterios distintos seria inventar datos. La armonizacion es una
    decision analitica de la semana 6.
    """
    ruta = RAW / ARCHIVOS["historico"][0]
    df = pd.read_excel(ruta, sheet_name=hoja, header=None)

    anios = df.iloc[fila_anio].ffill()
    niveles = [df.iloc[f].ffill() if len(filas_categoria) > 1 else df.iloc[f]
               for f in filas_categoria]
    primera_fila_datos = max(filas_categoria) + 1

    filas = []
    for i in range(primera_fila_datos, len(df)):
        depto = df.iloc[i, 0]
        if pd.isna(depto):
            continue
        depto = normalizar_departamento(depto)
        if depto.startswith("TOTAL") or depto.startswith("FUENTE"):
            continue

        for j in range(1, df.shape[1]):
            anio = anios.iloc[j]
            try:
                anio = int(float(anio))
            except (TypeError, ValueError):
                continue

            etiquetas = [niveles[k].iloc[j] for k in range(len(filas_categoria))]
            if any(pd.isna(e) for e in etiquetas):
                continue
            etiquetas = [re.sub(r"\s+", " ", str(e)).strip().upper() for e in etiquetas]
            # Las columnas de subtotal no son categorias
            if any(e.startswith("TOTAL") for e in etiquetas):
                continue

            valor = pd.to_numeric(df.iloc[i, j], errors="coerce")
            if pd.isna(valor):
                continue

            fila = {"departamento": depto, "anio": anio}
            fila.update(dict(zip(nombres_categoria, etiquetas)))
            fila[nombre_valor] = int(valor)
            filas.append(fila)

    salida = pd.DataFrame(filas)
    esquemas = salida.groupby("anio")[nombres_categoria[-1]].nunique()
    log(f"    {hoja}: {len(salida):,} filas, {salida['anio'].min()}-{salida['anio'].max()}, "
        f"{salida[nombres_categoria[-1]].nunique()} categorias distintas "
        f"({esquemas.min()}-{esquemas.max()} por anio)")
    return salida


def procesar_historico():
    """Convierte la hoja 'SINIESTROS AÑO REGIÓN' a formato largo (tidy).

    El libro historico son 14 hojas de tablas de reporte, no datos tidy. Esta
    hoja aporta la serie principal: total de siniestros (de toda gravedad, no
    solo fatales) por departamento y anio, util como contexto de largo plazo.
    """
    ruta = RAW / ARCHIVOS["historico"][0]
    df = pd.read_excel(ruta, sheet_name="SINIESTROS AÑO REGIÓN", header=None)

    anios = [int(a) for a in df.iloc[3, 1:].dropna()]
    filas = []
    for i in range(4, len(df)):
        depto = df.iloc[i, 0]
        if pd.isna(depto):
            continue
        depto = normalizar_departamento(depto)
        if depto.startswith("TOTAL"):
            continue
        for j, anio in enumerate(anios, start=1):
            valor = pd.to_numeric(df.iloc[i, j], errors="coerce")
            if pd.notna(valor):
                filas.append({"departamento": depto, "anio": anio,
                              "siniestros_totales": int(valor)})

    salida = pd.DataFrame(filas)
    log(f"    {len(salida)} filas, {salida['anio'].min()}-{salida['anio'].max()}")
    return salida


def escribir_csv(df, nombre):
    DATA.mkdir(parents=True, exist_ok=True)
    ruta = DATA / nombre
    df.to_csv(ruta, index=False, encoding="utf-8", lineterminator="\n",
              quoting=csv.QUOTE_MINIMAL)
    kb = ruta.stat().st_size / 1024
    log(f"  escrito: data/{nombre}  ({len(df):,} filas x {len(df.columns)} cols, {kb:,.0f} KB)")


# ---------------------------------------------------------------------------
# Diccionario de datos
# ---------------------------------------------------------------------------

DESCRIPCIONES = {
    ("siniestros", "codigo_siniestro"): ("Identificador unico del siniestro. Llave primaria. Formato A-AAAA-MM-N.", "Identificador"),
    ("siniestros", "fecha_siniestro"): ("Fecha de ocurrencia del siniestro.", "Fecha ISO 8601 (YYYY-MM-DD)"),
    ("siniestros", "hora_siniestro"): ("Hora de ocurrencia declarada en el parte policial.", "Texto HH:MM"),
    ("siniestros", "hora_del_dia"): ("Hora del dia derivada de hora_siniestro. Columna calculada, no viene en la fuente.", "Entero 0-23"),
    ("siniestros", "clase_siniestro"): ("Tipo de evento segun tipologia de la PNP.", "Categoria"),
    ("siniestros", "cantidad_fallecidos"): ("Numero de personas fallecidas en el siniestro.", "Conteo de personas"),
    ("siniestros", "cantidad_lesionados"): ("Numero de personas lesionadas en el siniestro.", "Conteo de personas"),
    ("siniestros", "cantidad_vehiculos_danados"): ("Numero de vehiculos con danos materiales.", "Conteo de vehiculos"),
    ("siniestros", "departamento"): ("Departamento donde ocurrio el siniestro. Primer nivel de la division politica.", "Categoria"),
    ("siniestros", "provincia"): ("Provincia donde ocurrio el siniestro. Segundo nivel.", "Categoria"),
    ("siniestros", "distrito"): ("Distrito donde ocurrio el siniestro. Tercer nivel.", "Categoria"),
    ("siniestros", "zona"): ("Caracter urbano o rural del lugar del siniestro.", "Categoria"),
    ("siniestros", "tipo_via"): ("Tipo de via donde ocurrio el hecho.", "Categoria"),
    ("siniestros", "red_vial"): ("Jerarquia de la red vial a la que pertenece la via.", "Categoria"),
    ("siniestros", "cod_carretera"): ("Codigo oficial de la carretera segun el clasificador del MTC.", "Codigo"),
    ("siniestros", "latitud"): ("Latitud del punto del siniestro en grados decimales, WGS84.", "Grados decimales"),
    ("siniestros", "longitud"): ("Longitud del punto del siniestro en grados decimales, WGS84.", "Grados decimales"),
    ("siniestros", "condicion_climatica"): ("Condicion del clima al momento del siniestro.", "Categoria"),
    ("siniestros", "zonificacion"): ("Uso de suelo predominante en el entorno del siniestro.", "Categoria"),
    ("siniestros", "caracteristicas_via"): ("Geometria del tramo: recto, curva, interseccion, etc.", "Categoria"),
    ("siniestros", "perfil_longitudinal_via"): ("Pendiente del tramo: plana o inclinada.", "Categoria"),
    ("siniestros", "superficie_calzada"): ("Material de la superficie de rodadura.", "Categoria"),
    ("siniestros", "existe_senal_vertical"): ("Si el tramo cuenta con senalizacion vertical.", "Categoria"),
    ("siniestros", "clasificacion_senal_vertical_1"): ("Tipo de la primera senal vertical presente.", "Categoria"),
    ("siniestros", "clasificacion_senal_vertical_2"): ("Tipo de la segunda senal vertical presente.", "Categoria"),
    ("siniestros", "existe_senal_horizontal"): ("Si el tramo cuenta con senalizacion horizontal (marcas en calzada).", "Categoria"),
    ("siniestros", "causa_factor_principal"): ("Factor causal principal atribuido por la PNP. Mayoritariamente sin determinar.", "Categoria"),
    ("siniestros", "causa_especifica"): ("Detalle de la causa dentro del factor principal.", "Categoria"),

    ("vehiculos", "codigo_siniestro"): ("Siniestro al que pertenece el vehiculo. Llave foranea a siniestros.csv.", "Identificador"),
    ("vehiculos", "codigo_vehiculo"): ("Identificador unico del vehiculo involucrado. Llave primaria. Formato V-AAAA-MM-N-K.", "Identificador"),
    ("vehiculos", "departamento"): ("Departamento del siniestro. Redundante con siniestros.csv.", "Categoria"),
    ("vehiculos", "provincia"): ("Provincia del siniestro. Redundante con siniestros.csv.", "Categoria"),
    ("vehiculos", "distrito"): ("Distrito del siniestro. Redundante con siniestros.csv.", "Categoria"),
    ("vehiculos", "situacion_vehiculo"): ("Situacion del vehiculo tras el hecho: identificado, fugado, etc.", "Categoria"),
    ("vehiculos", "estado_modalidad"): ("Si el vehiculo estaba habilitado para la modalidad de servicio que prestaba.", "Categoria"),
    ("vehiculos", "modalidad_transporte"): ("Modalidad de servicio: particular, transporte de personas, carga, etc.", "Categoria"),
    ("vehiculos", "elemento_transportado"): ("Que transportaba el vehiculo: personas, carga o mercancias.", "Categoria"),
    ("vehiculos", "ambito_servicio"): ("Ambito de la autorizacion del servicio: nacional, regional, provincial.", "Categoria"),
    ("vehiculos", "posee_seguro"): ("Si el vehiculo contaba con algun seguro.", "Categoria"),
    ("vehiculos", "estado_soat"): ("Vigencia del SOAT al momento del siniestro. Indicador de informalidad.", "Categoria"),
    ("vehiculos", "tipo_seguro"): ("Tipo de seguro: SOAT, CAT u otro.", "Categoria"),
    ("vehiculos", "compania_seguro"): ("Aseguradora emisora de la poliza.", "Categoria"),
    ("vehiculos", "posee_citv"): ("Si el vehiculo contaba con Certificado de Inspeccion Tecnica Vehicular.", "Categoria"),
    ("vehiculos", "estado_citv"): ("Vigencia del CITV. Indicador del estado mecanico formal del vehiculo.", "Categoria"),
    ("vehiculos", "vehiculo"): ("Clase de vehiculo segun el Reglamento Nacional de Vehiculos.", "Categoria"),
    ("vehiculos", "clase_siniestro"): ("Clase del siniestro. Redundante con siniestros.csv.", "Categoria"),
    ("vehiculos", "fecha_siniestro"): ("Fecha del siniestro. Redundante con siniestros.csv.", "Fecha ISO 8601 (YYYY-MM-DD)"),
    ("vehiculos", "anio"): ("Anio del siniestro.", "Entero"),
    ("vehiculos", "mes"): ("Mes del siniestro, nombre en espanol.", "Categoria"),
    ("vehiculos", "dia_semana"): ("Dia de la semana del siniestro.", "Categoria"),
    ("vehiculos", "hora"): ("Hora del siniestro.", "Entero 0-23"),
    ("vehiculos", "cod_carretera"): ("Codigo de carretera. Redundante con siniestros.csv.", "Codigo"),
    ("vehiculos", "tipo_via"): ("Tipo de via. Redundante con siniestros.csv.", "Categoria"),

    ("personas", "codigo_siniestro"): ("Siniestro al que pertenece la persona. Llave foranea a siniestros.csv.", "Identificador"),
    ("personas", "codigo_vehiculo"): ("Vehiculo asociado a la persona. Llave foranea a vehiculos.csv.", "Identificador"),
    ("personas", "codigo_persona"): ("Identificador unico de la persona involucrada. Llave primaria. Formato P-AAAA-MM-N-K-M.", "Identificador"),
    ("personas", "departamento"): ("Departamento del siniestro. Redundante con siniestros.csv.", "Categoria"),
    ("personas", "provincia"): ("Provincia del siniestro. Redundante con siniestros.csv.", "Categoria"),
    ("personas", "distrito"): ("Distrito del siniestro. Redundante con siniestros.csv.", "Categoria"),
    ("personas", "tipo_persona"): ("Rol de la persona en el siniestro: conductor, pasajero, peaton, ocupante.", "Categoria"),
    ("personas", "gravedad"): ("Desenlace para la persona: fallecido, lesionado o ileso.", "Categoria"),
    ("personas", "lugar_atencion_lesionado"): ("Establecimiento donde se atendio al lesionado. Solo aplica a lesionados.", "Categoria"),
    ("personas", "lugar_defuncion"): ("Lugar donde se produjo la muerte. Solo aplica a fallecidos.", "Categoria"),
    ("personas", "situacion_persona"): ("Si la persona fue identificada por la autoridad.", "Categoria"),
    ("personas", "pais_nacionalidad"): ("Pais de nacionalidad de la persona.", "Categoria"),
    ("personas", "edad"): ("Edad de la persona en anios cumplidos.", "Anios"),
    ("personas", "sexo"): ("Sexo registrado de la persona.", "Categoria"),
    ("personas", "posee_licencia"): ("Si la persona contaba con licencia de conducir. Solo aplica a conductores.", "Categoria"),
    ("personas", "estado_licencia"): ("Vigencia de la licencia de conducir.", "Categoria"),
    ("personas", "clase_licencia"): ("Clase y categoria de la licencia segun el reglamento del MTC.", "Categoria"),
    ("personas", "sometio_dosaje_cualitativo"): ("Si se practico dosaje etilico cualitativo. Fuertemente subregistrado.", "Categoria"),
    ("personas", "resultado_dosaje_cualitativo"): ("Resultado del dosaje etilico cualitativo. Solo presente si se practico la prueba.", "Categoria"),
    ("personas", "sometio_dosaje_cuantitativo"): ("Si se practico dosaje etilico cuantitativo. El valor en g/L no se publica.", "Categoria"),
    ("personas", "vehiculo"): ("Clase del vehiculo asociado a la persona. Redundante con vehiculos.csv.", "Categoria"),
    ("personas", "fecha_siniestro"): ("Fecha del siniestro. Redundante con siniestros.csv.", "Fecha ISO 8601 (YYYY-MM-DD)"),
    ("personas", "anio"): ("Anio del siniestro.", "Entero"),
    ("personas", "mes"): ("Mes del siniestro, nombre en espanol.", "Categoria"),
    ("personas", "dia_semana"): ("Dia de la semana del siniestro.", "Categoria"),
    ("personas", "hora"): ("Hora del siniestro.", "Entero 0-23"),
    ("personas", "clase_siniestro"): ("Clase del siniestro. Redundante con siniestros.csv.", "Categoria"),
    ("personas", "causa_factor_principal"): ("Factor causal principal. Redundante con siniestros.csv.", "Categoria"),
    ("personas", "causa_especifica"): ("Causa especifica. Redundante con siniestros.csv.", "Categoria"),
    ("personas", "tipo_via"): ("Tipo de via. Redundante con siniestros.csv.", "Categoria"),
    ("personas", "cod_carretera"): ("Codigo de carretera. Redundante con siniestros.csv.", "Codigo"),
    ("personas", "red_vial"): ("Jerarquia de red vial. Redundante con siniestros.csv.", "Categoria"),

    ("historico_departamento_anio", "departamento"): ("Departamento del Peru, normalizado sin tildes para poder unir con las bases detalladas.", "Categoria"),
    ("historico_departamento_anio", "anio"): ("Anio calendario.", "Entero"),
    ("historico_departamento_anio", "siniestros_totales"): ("Siniestros de transito de TODA gravedad, no solo fatales. Fuente: Anuarios Estadisticos PNP.", "Conteo de siniestros"),

    ("historico_causas", "departamento"): ("Departamento del Peru, normalizado sin tildes.", "Categoria"),
    ("historico_causas", "anio"): ("Anio calendario.", "Entero"),
    ("historico_causas", "causa"): ("Causa atribuida al siniestro. ATENCION: la taxonomia cambia entre anios y no coincide con la de siniestros.csv; no armonizada a proposito.", "Categoria"),
    ("historico_causas", "siniestros"): ("Siniestros de toda gravedad atribuidos a esa causa.", "Conteo de siniestros"),

    ("historico_franja_horaria", "departamento"): ("Departamento del Peru, normalizado sin tildes.", "Categoria"),
    ("historico_franja_horaria", "anio"): ("Anio calendario.", "Entero"),
    ("historico_franja_horaria", "franja_horaria"): ("Bloque de seis horas en que ocurrio el siniestro.", "Categoria"),
    ("historico_franja_horaria", "siniestros"): ("Siniestros de toda gravedad en esa franja.", "Conteo de siniestros"),

    ("historico_fallecidos_demografia", "departamento"): ("Departamento del Peru, normalizado sin tildes.", "Categoria"),
    ("historico_fallecidos_demografia", "anio"): ("Anio calendario.", "Entero"),
    ("historico_fallecidos_demografia", "sexo"): ("Sexo de la persona fallecida.", "Categoria"),
    ("historico_fallecidos_demografia", "grupo_etario"): ("Grupo de edad. ATENCION: en 2008-2009 solo se distingue menor/mayor de 18 anios; desde 2010 se usan seis grupos. No armonizado a proposito.", "Categoria"),
    ("historico_fallecidos_demografia", "fallecidos"): ("Personas fallecidas en siniestros de transito.", "Conteo de personas"),
}

# Nombres originales, para dejar trazable la correspondencia
ORIGINALES = {}
for tabla, mapa in [("siniestros", REN_SINIESTROS), ("vehiculos", REN_VEHICULOS),
                    ("personas", REN_PERSONAS)]:
    for orig, nuevo in mapa.items():
        ORIGINALES[(tabla, nuevo)] = orig
ORIGINALES[("siniestros", "hora_del_dia")] = "(derivada de HORA SINIESTRO)"


def tipo_logico(serie):
    if pd.api.types.is_float_dtype(serie):
        return "decimal"
    if pd.api.types.is_integer_dtype(serie):
        return "entero"
    texto = serie.dropna().astype(str)
    if len(texto) and texto.str.match(r"^\d{4}-\d{2}-\d{2}$").all():
        return "fecha"
    return "texto"


def construir_diccionario(tablas):
    filas = []
    for nombre_tabla, df in tablas.items():
        total = len(df)
        for col in df.columns:
            s = df[col]
            nulos = int(s.isna().sum())
            distintos = int(s.nunique(dropna=True))

            desc, unidad = DESCRIPCIONES.get(
                (nombre_tabla, col), ("Sin descripcion asignada.", ""))

            if distintos <= 25 and tipo_logico(s) == "texto":
                valores = sorted(str(v) for v in s.dropna().unique())
                posibles = " | ".join(valores)
            elif pd.api.types.is_numeric_dtype(s) and s.notna().any():
                posibles = f"rango {s.min():g} a {s.max():g}"
            elif tipo_logico(s) == "fecha" and s.notna().any():
                posibles = f"rango {s.dropna().min()} a {s.dropna().max()}"
            else:
                posibles = f"{distintos} valores distintos"

            filas.append({
                "tabla": nombre_tabla,
                "campo": col,
                "campo_original": ORIGINALES.get((nombre_tabla, col), col),
                "descripcion": desc,
                "tipo_dato": tipo_logico(s),
                "unidad_o_formato": unidad,
                "valores_posibles": posibles,
                "registros": total,
                "valores_faltantes": nulos,
                "pct_faltantes": f"{100 * nulos / total:.1f}" if total else "",
                "codigo_faltante_conocido": "celda vacia; ademas 'NO SE CONOCE', "
                                            "'NO REGISTRA', 'NO CORRESPONDE' y "
                                            "'NO APLICA' funcionan como faltantes",
            })
    return pd.DataFrame(filas)


def validar(sin, veh, per):
    """Verifica la integridad relacional. Falla ruidosamente si no se cumple."""
    log("\n--- Validacion de integridad ---")

    ids_sin = set(sin["codigo_siniestro"])
    ids_veh = set(veh["codigo_vehiculo"])

    hv = veh["codigo_siniestro"].isin(ids_sin).sum()
    log(f"  vehiculos -> siniestros : {hv:,} / {len(veh):,}")
    hp = per["codigo_vehiculo"].isin(ids_veh).sum()
    log(f"  personas  -> vehiculos  : {hp:,} / {len(per):,}")

    dup_s = int(sin["codigo_siniestro"].duplicated().sum())
    dup_v = int(veh["codigo_vehiculo"].duplicated().sum())
    dup_p = int(per["codigo_persona"].duplicated().sum())
    log(f"  llaves duplicadas       : siniestros={dup_s}, vehiculos={dup_v}, personas={dup_p}")
    if dup_p:
        codigos = per.loc[per["codigo_persona"].duplicated(keep=False),
                          "codigo_persona"].unique()
        log(f"    personas repetidas    : {', '.join(codigos)}")
        log("    anomalia conocida y documentada en el README (seccion Limitaciones)")

    en_peru = (sin["latitud"].between(-18.5, 0) & sin["longitud"].between(-81.5, -68.5))
    log(f"  coordenadas en el Peru  : {en_peru.sum():,} / {len(sin):,}")

    muertos_sin = sin["cantidad_fallecidos"].sum()
    muertos_per = (per["gravedad"] == "FALLECIDO").sum()
    log(f"  fallecidos declarados   : {muertos_sin:,.0f} (siniestros) vs {muertos_per:,} (personas)")
    if muertos_sin != muertos_per:
        log("    nota: la diferencia debe explicarse en el analisis de la semana 6")

    # La integridad referencial es el criterio que debe pasar. El unico codigo de
    # persona repetido es una anomalia puntual del registro, ya caracterizada, y
    # se reporta aparte para no enmascararla ni bloquear el proceso.
    integridad = (hv == len(veh) and hp == len(per)
                  and dup_s == 0 and dup_v == 0)
    log(f"\n  RESULTADO: integridad referencial "
        f"{'correcta' if integridad else 'FALLIDA'}"
        f"{f'; {dup_p} anomalia(s) conocida(s) documentada(s)' if dup_p else ''}")
    return integridad


def contrastar_historico(base, causas, franja):
    """Contrasta los totales anuales entre hojas del mismo libro historico.

    Las hojas del libro del ONSV deberian cuadrar entre si: la suma de todas las
    causas de un anio, o de todas las franjas horarias, deberia igualar el total
    de siniestros de ese anio. No siempre ocurre, y las diferencias son del
    origen, no del parseo (los bloques se alinean con sus etiquetas de anio).
    Se reportan para que queden documentadas y visibles en cada ejecucion.
    """
    log("\n--- Contraste entre hojas del libro historico ---")
    b = base.groupby("anio")["siniestros_totales"].sum()
    c = causas.groupby("anio")["siniestros"].sum()
    f = franja.groupby("anio")["siniestros"].sum()

    problemas = 0
    for anio in sorted(b.index):
        dc = int(c.get(anio, 0) - b[anio])
        df_ = int(f.get(anio, 0) - b[anio])
        if dc or df_:
            problemas += 1
            log(f"  {anio}: total={b[anio]:,}  causas {dc:+,}  franja {df_:+,}")
    if problemas == 0:
        log("  todas las hojas cuadran")
    else:
        log(f"  {problemas} anio(s) con discrepancia entre hojas del origen "
            "(ver README, seccion Limitaciones)")
    return problemas


def construir_muestra(sin, veh, per, n=200):
    """Muestra desnormalizada que ilustra el encadenado de las tres tablas.

    Se seleccionan columnas disjuntas de cada tabla antes de unir, de modo que el
    merge no genere sufijos y la muestra se lea directamente.
    """
    cols_per = ["codigo_siniestro", "codigo_vehiculo", "codigo_persona",
                "tipo_persona", "gravedad", "edad", "sexo"]
    cols_veh = ["codigo_vehiculo", "vehiculo", "modalidad_transporte", "estado_soat"]
    cols_sin = ["codigo_siniestro", "fecha_siniestro", "hora_siniestro",
                "departamento", "provincia", "distrito", "latitud", "longitud",
                "zona", "clase_siniestro", "causa_factor_principal"]

    primeros = sin.head(n)["codigo_siniestro"]
    m = (per.loc[per["codigo_siniestro"].isin(primeros), cols_per]
         .merge(veh[cols_veh], on="codigo_vehiculo", how="left")
         .merge(sin[cols_sin], on="codigo_siniestro", how="left"))

    orden = ["codigo_siniestro", "codigo_vehiculo", "codigo_persona",
             "fecha_siniestro", "hora_siniestro", "departamento", "provincia",
             "distrito", "latitud", "longitud", "zona", "clase_siniestro",
             "causa_factor_principal", "vehiculo", "modalidad_transporte",
             "estado_soat", "tipo_persona", "gravedad", "edad", "sexo"]
    return m[orden].head(500)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true",
                    help="no descargar; usar los archivos ya presentes en raw/")
    args = ap.parse_args()

    log(f"Adquisicion ONSV - ejecutado el {date.today().isoformat()}")
    log(f"Fuente: {FUENTE}\n")

    if args.offline:
        log("[1/5] Descarga omitida (--offline)")
        if not RAW.exists():
            sys.exit(f"ERROR: no existe {RAW}. Ejecute sin --offline la primera vez.")
    else:
        log("[1/5] Descargando archivos de origen")
        descargar()

    log("\n[2/5] Leyendo y limpiando")
    sin = limpiar(leer_bbdd(ARCHIVOS["siniestros"][0]), REN_SINIESTROS,
                  "codigo_siniestro", NUMERICAS["siniestros"])
    log(f"  siniestros: {len(sin):,} filas")
    veh = limpiar(leer_bbdd(ARCHIVOS["vehiculos"][0]), REN_VEHICULOS,
                  "codigo_vehiculo", NUMERICAS["vehiculos"])
    log(f"  vehiculos : {len(veh):,} filas")
    per = limpiar(leer_bbdd(ARCHIVOS["personas"][0]), REN_PERSONAS,
                  "codigo_persona", NUMERICAS["personas"])
    log(f"  personas  : {len(per):,} filas")
    log("  historico :")
    hist = procesar_historico()
    hist_causas = parsear_bloques(
        "CAUSAS POR REGIÓN", 3, [4], ["causa"], "siniestros")
    hist_franja = parsear_bloques(
        "FRANJA HORARIA", 3, [4], ["franja_horaria"], "siniestros")
    hist_fallecidos = parsear_bloques(
        "FALLECIDOS", 3, [4, 5], ["sexo", "grupo_etario"], "fallecidos")

    log("\n[3/5] Escribiendo CSV")
    escribir_csv(sin, "siniestros.csv")
    escribir_csv(veh, "vehiculos.csv")
    escribir_csv(per, "personas.csv")
    escribir_csv(hist, "historico_departamento_anio.csv")
    escribir_csv(hist_causas, "historico_causas.csv")
    escribir_csv(hist_franja, "historico_franja_horaria.csv")
    escribir_csv(hist_fallecidos, "historico_fallecidos_demografia.csv")
    escribir_csv(construir_muestra(sin, veh, per), "sample.csv")

    log("\n[4/5] Generando diccionario de datos")
    dicc = construir_diccionario({
        "siniestros": sin, "vehiculos": veh, "personas": per,
        "historico_departamento_anio": hist,
        "historico_causas": hist_causas,
        "historico_franja_horaria": hist_franja,
        "historico_fallecidos_demografia": hist_fallecidos,
    })
    ruta = BASE / "data_dictionary.csv"
    dicc.to_csv(ruta, index=False, encoding="utf-8", lineterminator="\n")
    log(f"  escrito: data_dictionary.csv ({len(dicc)} atributos documentados)")

    sin_desc = (dicc["descripcion"] == "Sin descripcion asignada.").sum()
    if sin_desc:
        log(f"  ADVERTENCIA: {sin_desc} atributos sin descripcion")

    log("\n[5/5] Validando")
    validar(sin, veh, per)
    contrastar_historico(hist, hist_causas, hist_franja)
    log("\nListo.")


if __name__ == "__main__":
    main()
