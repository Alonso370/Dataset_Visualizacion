# Procedimiento de adquisición y decisiones de transformación

Documento complementario al [`README.md`](README.md). Registra cómo se obtuvieron los
datos, qué se transformó, qué se dejó intacto y qué trampas trae el origen.

Todo lo descrito aquí está implementado en [`acquisition.py`](acquisition.py) y es
reproducible con un comando.

---

## 1. Origen

Los archivos se publican como descarga directa en la sección de datos abiertos del ONSV.
No hay API, ni autenticación, ni límite de tasa. Las cuatro URL están fijadas en el
diccionario `ARCHIVOS` del script:

| Archivo | Tamaño | Contenido |
|---|---|---|
| `BBDD ONSV - SINIESTROS FATALES 2021-2025 (preliminar).xlsx` | 1.5 MB | El siniestro |
| `BBDD ONSV - VEHICULOS 2021-2025 (preliminar).xlsx` | 1.8 MB | Vehículos involucrados |
| `BBDD ONSV - PERSONAS 2021-2025 (preliminar).xlsx` | 4.2 MB | Personas involucradas |
| `PERU. SINIESTROS DE TRANSITO POR ANO_2008-2025_preliminar.xlsx` | 380 KB | Serie histórica |

Los originales se guardan sin modificar en `raw/`. Esa carpeta no se versiona: el script
la reconstruye. Así el repositorio conserva solo los CSV derivados y el código que los
produce, y cualquiera puede verificar que los CSV se obtienen efectivamente del origen.

---

## 2. Trampas del formato de origen

Cuatro problemas hicieron que la conversión no fuera un `read_excel` directo. Se documentan
porque son exactamente el tipo de detalle que la guía pide explicar, y porque cualquiera
que reprocese los datos se los va a encontrar.

### 2.1 La fila de encabezado se mueve

Cada libro trae entre dos y cuatro filas de notas antes de la cabecera real, y **la
posición cambia de un archivo a otro**. Un `skiprows` fijo funciona en un archivo y rompe
en el siguiente, produciendo columnas llamadas `Unnamed: 1` sin ningún error visible.

El script localiza la cabecera buscando la primera fila que contenga la palabra `CÓDIGO`,
que aparece en el nombre de la llave primaria de las tres bases.

### 2.2 La columna de fecha es de tipo mixto

`FECHA SINIESTRO` contiene mayoritariamente cadenas en formato `DD/MM/YYYY`, pero unas
pocas celdas son objetos `datetime` nativos de Excel. Pandas infiere **un solo** formato
para toda la columna a partir de los primeros valores y convierte en `NaT` todo lo que no
encaje, de modo que con `errors="coerce"` se perdían siete fechas en silencio.

Se resuelve parseando elemento por elemento con `format="mixed"` y `dayfirst=True`. Tras
la corrección, las 9,106 fechas de siniestros parsean correctamente.

### 2.3 Códigos de siniestro con sufijo de letra

Catorce registros llevan sufijo `-A` o `-B` sobre un mismo código base, en siete pares
(por ejemplo `A-2023-05-110-A` y `A-2023-05-110-B`). Parecen ser hechos desdoblados en dos
partes por la unidad que los registró. **No se alteran ni se fusionan**: se conservan como
siniestros independientes, que es como los publica la fuente. Conviene revisarlos en la
Semana 6 antes de agregar por siniestro.

### 2.4 El libro histórico no son datos tidy

El cuarto archivo son catorce hojas de tablas de reporte ya agregadas, con títulos, notas
al pie, filas de totales y dos hojas ocultas — no un dataset. Solo tres de las tres bases
principales tienen una hoja única; **este archivo requiere elegir hoja por hoja**.

Se extrajeron cuatro hojas a formato largo:

| Hoja | Salida | Estructura |
|---|---|---|
| `SINIESTROS AÑO REGIÓN` | `historico_departamento_anio.csv` | departamento × año |
| `CAUSAS POR REGIÓN` | `historico_causas.csv` | departamento × año × causa |
| `FRANJA HORARIA` | `historico_franja_horaria.csv` | departamento × año × franja |
| `FALLECIDOS` | `historico_fallecidos_demografia.csv` | departamento × año × sexo × grupo etario |

Las tres últimas usan un mismo patrón: **bloques anuales yuxtapuestos horizontalmente**,
donde una fila marca el año al inicio de cada bloque (y queda vacía en el resto de sus
columnas, por lo que hay que propagarla) y una o dos filas más abajo llevan los
encabezados de categoría. `parsear_bloques()` implementa ese patrón de forma genérica, con
lo que incorporar otra hoja del mismo libro cuesta una línea.

> **Corrección.** Una versión anterior de este documento afirmaba que las hojas restantes
> eran "vistas derivadas reconstruibles desde las bases detalladas". Eso es cierto solo
> para 2021–2025. Las bases detalladas no cubren 2008–2020, de modo que para esos trece
> años estas hojas son la **única** fuente de desglose por causa, franja horaria y
> demografía. Por eso se extrajeron.

De las diez hojas no extraídas —siniestros por tipo, vehículos por tipo y región, heridos,
día de la semana, comparativos y las dos ocultas de ámbito rural— ninguna se descarta por
redundante: simplemente no hay una pregunta de dominio que hoy las requiera. Se incorporan
cuando la haya.

**Nada se armoniza.** Los conjuntos de categorías cambian entre años (ver README,
limitación 10) y se preserva la etiqueta tal como aparece en el origen, erratas incluidas
(`EBRIEDAD DEL CONDUTOR`, `INVACIÓN DE CARRIL`). Unificar criterios distintos sería
inventar datos, y es una decisión analítica que corresponde a la Semana 6.

### 2.5 Los nombres de departamento difieren entre archivos

El libro histórico escribe `HUÁNUCO` y `AMAZÓNAS` con tilde y arrastra espacios finales
(`ANCASH `), mientras que las bases detalladas usan la forma sin tilde. Sin normalizar, las
tablas no se pueden unir por departamento.

`normalizar_departamento()` recorta, colapsa espacios, pasa a mayúsculas y descompone los
acentos vía `unicodedata`. Tras aplicarlo, los 25 departamentos del histórico coinciden
exactamente con los de las bases detalladas, sin sobrantes en ninguna dirección.

---

## 3. Transformaciones aplicadas

La Semana 4 está deliberadamente limitada a los datos, así que la regla fue **empaquetar
sin analizar**: solo transformaciones necesarias para que el CSV sea utilizable y
verificable. Las derivaciones analíticas corresponden a la Semana 6.

| Transformación | Motivo |
|---|---|
| Excel → CSV UTF-8 | Formato pedido por la guía y consumible por `d3.csv()` |
| Nombres de columna a `snake_case` sin tildes | Los originales traen tildes, `¿?`, `Nº` y espacios dobles, que complican el acceso desde JavaScript. La correspondencia queda registrada en la columna `campo_original` del diccionario |
| Fechas a ISO 8601 (`YYYY-MM-DD`) | `d3.timeParse("%Y-%m-%d")` sin configuración adicional; además ordena lexicográficamente |
| Recorte y colapso de espacios en texto | El origen trae espacios finales inconsistentes que fragmentan categorías idénticas (`"DESPISTE"` y `"DESPISTE "` como dos valores) |
| Coerción numérica en conteos, coordenadas y edad | Venían como texto mezclado con numérico |
| Columna derivada `hora_del_dia` | Extrae la hora entera de `hora_siniestro` (`"04:40"` → `4`). Es la única columna calculada, y está marcada como tal en el diccionario |
| Descarte de filas sin llave primaria | Elimina las filas de notas al pie que Excel arrastra al final de la hoja |

### Lo que deliberadamente NO se transformó

- **No se imputó ningún valor faltante.** Ni edades, ni causas, ni la longitud ausente.
- **No se unificaron los códigos de faltante.** `NO SE CONOCE`, `NO REGISTRA`,
  `NO CORRESPONDE` y `NO APLICA` se conservan tal cual porque **no significan lo mismo**:
  `NO CORRESPONDE` dice que el atributo no aplica al caso, `NO REGISTRA` dice que falta la
  información. Colapsarlos destruiría esa distinción.
- **No se eliminó la redundancia entre tablas.** `vehiculos` y `personas` repiten
  departamento, fecha y clase de siniestro. Se conservan para que cada CSV sea legible por
  sí solo, y quedan marcadas como redundantes en el diccionario.
- **No se corrigió el código de persona duplicado**, ni se descartaron los años
  preliminares. Ambas cosas son decisiones analíticas, no de empaquetado.
- **No se normalizaron los nombres de distrito** contra el padrón del INEI. Es necesario
  para unir con la cartografía y con población, y está previsto para la Semana 6.

---

## 4. Validación

El script termina ejecutando comprobaciones y las imprime en consola. Falla ruidosamente si
la estructura del origen cambia: si el ONSV renombra o elimina una columna esperada, la
función `limpiar()` lanza una excepción con la lista de columnas ausentes, en lugar de
producir un CSV incompleto en silencio.

Se comprueba:

1. **Integridad referencial** en ambas direcciones de la cadena siniestro → vehículo → persona.
2. **Unicidad de llaves primarias** en las tres tablas.
3. **Plausibilidad geográfica**: coordenadas dentro del rectángulo que contiene al Perú
   (latitud entre −18.5 y 0, longitud entre −81.5 y −68.5).
4. **Consistencia de fallecidos**: la suma de `cantidad_fallecidos` en `siniestros` contra
   el número de personas con `gravedad = FALLECIDO`. Ambas dan 10,859.
5. **Cobertura del diccionario**: advierte si algún atributo quedó sin descripción.
6. **Contraste entre hojas del histórico**: la suma de todas las causas de un año y la de
   todas las franjas horarias deberían igualar el total de siniestros de ese año.

Salida de la ejecución del 2 de setiembre de 2026:

```
--- Validacion de integridad ---
  vehiculos -> siniestros : 12,667 / 12,667
  personas  -> vehiculos  : 25,412 / 25,412
  llaves duplicadas       : siniestros=0, vehiculos=0, personas=1
    personas repetidas    : P-2023-04-103-1-2
  coordenadas en el Peru  : 9,105 / 9,106
  fallecidos declarados   : 10,859 (siniestros) vs 10,859 (personas)

  RESULTADO: integridad referencial correcta; 1 anomalia(s) conocida(s) documentada(s)

--- Contraste entre hojas del libro historico ---
  2008: total=85,337  causas +0  franja +689
  2009: total=86,026  causas -2,373  franja -689
  2013: total=101,762  causas +1,000  franja +1,000
  3 anio(s) con discrepancia entre hojas del origen
```

Las tres discrepancias son **del origen, no del parseo**, y están analizadas en el README,
limitación 11. Se comprobó que los bloques anuales se alinean exactamente con sus etiquetas
de año antes de concluirlo.

---

## 5. Sobre el diccionario de datos

`data_dictionary.csv` se genera automáticamente y no se edita a mano: el script perfila los
CSV ya producidos y combina ese perfil con las descripciones curadas del diccionario
`DESCRIPCIONES`. Así las estadísticas nunca quedan desfasadas respecto de los datos.

Una fila por atributo, 101 en total, con las columnas:

`tabla`, `campo`, `campo_original`, `descripcion`, `tipo_dato`, `unidad_o_formato`,
`valores_posibles`, `registros`, `valores_faltantes`, `pct_faltantes`,
`codigo_faltante_conocido`.

Para atributos categóricos con 25 valores distintos o menos se enumeran todos los valores
observados; para los numéricos y de fecha se indica el rango.
