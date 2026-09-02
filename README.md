# Semana 4 — Selección y entrega del dataset

**Curso:** DS5343 Data Visualization · Universidad de Ingeniería y Tecnología · Semestre 2026-2
**Docente:** Prof. Germain Garcia-Zanabria
**Título de trabajo del proyecto:** Vías Letales — geografía de la mortalidad vial en el Perú

---

## 1. Identificación del dataset

| | |
|---|---|
| **Título** | Bases de datos de siniestros viales fatales del Perú, 2021–2025 (preliminar) |
| **Organización responsable** | Observatorio Nacional de Seguridad Vial (ONSV), Ministerio de Transportes y Comunicaciones del Perú |
| **URL de la fuente** | https://www.onsv.gob.pe/datosabiertos |
| **Recolector primario** | Unidades de Prevención e Investigación de Accidentes de Tránsito de la Policía Nacional del Perú (UPIAT–PNP) |
| **Fecha de acceso** | 2 de setiembre de 2026 |
| **Formato de origen** | Cuatro libros Excel (`.xlsx`) |
| **Formato entregado** | CSV UTF-8, delimitado por comas, salto de línea `\n` |
| **Licencia** | No declarada en el portal — ver sección 7 |

### Método de recolección

Cada siniestro fatal es levantado en campo por las unidades UPIAT de la Policía Nacional
del Perú, que elaboran el parte policial en el lugar de los hechos. El ONSV consolida esos
partes en tres bases relacionadas —siniestro, vehículos involucrados y personas
involucradas— y las publica periódicamente como datos abiertos. La serie histórica anexa
proviene de una fuente distinta: los Anuarios Estadísticos de la PNP.

El propio ONSV marca **2024 y 2025 como preliminares**, lo que significa que esos años
siguen recibiendo registros y sus cifras aún no son definitivas.

### Cobertura

- **Temporal:** 1 de enero de 2021 al 30 de diciembre de 2025 en las bases detalladas.
  La serie histórica complementaria cubre 2008–2024.
- **Geográfica:** todo el territorio del Perú — 25 departamentos (los 24 más la Provincia
  Constitucional del Callao), 182 provincias y 1,086 distritos, con coordenadas puntuales
  en grados decimales (WGS84). Atención: los nombres de distrito **no son únicos**; hay
  1,151 combinaciones distintas de departamento–provincia–distrito, de modo que unir por
  nombre de distrito solo produce cruces incorrectos.
- **Unidad de observación:** el siniestro de tránsito **con al menos un fallecido**.
  Los siniestros con solo heridos o daños materiales no están en estas bases.

---

## 2. Contenido del paquete

```
deliveries/week04/
├── README.md                  este documento
├── acquisition.md             procedimiento de adquisición y decisiones de transformación
├── acquisition.py             script reproducible: descarga, convierte y valida
├── data_dictionary.csv        101 atributos documentados, uno por fila
├── data/
│   ├── siniestros.csv                       9,106 filas × 28 columnas
│   ├── vehiculos.csv                       12,667 filas × 25 columnas
│   ├── personas.csv                        25,412 filas × 32 columnas
│   ├── historico_departamento_anio.csv        425 filas ×  3 columnas
│   ├── historico_causas.csv                 6,770 filas ×  4 columnas
│   ├── historico_franja_horaria.csv         3,700 filas ×  4 columnas
│   ├── historico_fallecidos_demografia.csv  4,700 filas ×  5 columnas
│   └── sample.csv                             500 filas × 20 columnas
└── raw/                       Excel originales sin modificar (no versionados)
```

Los CSV completos se entregan íntegros: el conjunto pesa unos 14 MB y no requiere
muestreo. `sample.csv` se incluye igualmente como ayuda de lectura — es una vista
desnormalizada que muestra las tres tablas ya encadenadas, para que se entienda el
modelo relacional sin necesidad de ejecutar un `join`.

---

## 3. Estructura relacional

Las tres tablas principales forman una jerarquía de tres niveles:

```
siniestros (1) ──< vehiculos (N) ──< personas (N)
   codigo_siniestro     codigo_vehiculo     codigo_persona
```

- `vehiculos.codigo_siniestro` → `siniestros.codigo_siniestro`
- `personas.codigo_vehiculo` → `vehiculos.codigo_vehiculo`
- `personas.codigo_siniestro` → `siniestros.codigo_siniestro`

Los identificadores son legibles y codifican la jerarquía: el siniestro `A-2023-04-103`
tiene el vehículo `V-2023-04-103-1`, que a su vez tiene la persona `P-2023-04-103-1-1`.

### Verificación de integridad

`acquisition.py` comprueba la integridad en cada ejecución. Resultado del
2 de setiembre de 2026:

| Comprobación | Resultado |
|---|---|
| `vehiculos` → `siniestros` | 12,667 / 12,667 |
| `personas` → `vehiculos` | 25,412 / 25,412 |
| Llaves primarias duplicadas | 0 en siniestros, 0 en vehículos, 1 en personas |
| Coordenadas dentro del Perú | 9,105 / 9,106 |
| Fallecidos: suma declarada vs. personas | 10,859 = 10,859 |

No hay registros huérfanos. La coincidencia exacta entre los fallecidos declarados en la
tabla de siniestros y las personas marcadas como `FALLECIDO` es una señal fuerte de
consistencia interna del registro.

---

## 4. Contenido temático

**`siniestros.csv`** — el hecho. Cuándo y dónde ocurrió, cuántas víctimas dejó, y en qué
condiciones: clase de siniestro, causa atribuida, clima, zonificación, geometría del tramo,
perfil de la vía, superficie de la calzada y presencia de señalización vertical y horizontal.

**`vehiculos.csv`** — los vehículos involucrados. Clase de vehículo, modalidad de
transporte, ámbito del servicio y, sobre todo, indicadores de formalidad: vigencia del SOAT
y del certificado de inspección técnica vehicular (CITV).

**`personas.csv`** — las personas involucradas. Rol en el siniestro (conductor, pasajero,
peatón u ocupante), desenlace, edad, sexo, nacionalidad, tenencia y clase de licencia de
conducir, y si se practicó dosaje etílico.

### Las cuatro tablas históricas

Las bases detalladas solo cubren 2021–2025. El libro histórico del ONSV extiende la
cobertura hasta 2008 con agregados por departamento, y esa información **no es recuperable
desde las bases detalladas** para los años anteriores a 2021. Se extrajeron cuatro de sus
catorce hojas:

| Archivo | Desglose | Años |
|---|---|---|
| `historico_departamento_anio.csv` | departamento × año | 2008–2024 |
| `historico_causas.csv` | departamento × año × causa | 2008–2024 |
| `historico_franja_horaria.csv` | departamento × año × franja horaria | 2008–2024 |
| `historico_fallecidos_demografia.csv` | departamento × año × sexo × grupo etario | 2008–2024 |

Dos advertencias sobre estas tablas:

- **Cuentan siniestros de toda gravedad**, no solo fatales, así que sus magnitudes no son
  comparables directamente con `siniestros.csv`. En 2024 hubo 86,757 siniestros de toda
  gravedad frente a 1,555 fatales.
- **Los esquemas de categoría cambian entre años** y se conservaron sin armonizar, porque
  unificar criterios distintos sería inventar datos. Ver limitación 10.

Las diez hojas restantes del libro histórico se dejaron fuera: son cruces adicionales de
las mismas dimensiones (siniestros por tipo, vehículos por tipo y región, heridos, día de
la semana) que pueden incorporarse más adelante con el mismo parser genérico si alguna
pregunta de dominio los requiere.

---

## 5. Por qué sirve para visualización

La guía del curso pide datos ricos, con varias tablas y estructuralmente interesantes.
Este conjunto reúne cuatro estructuras a la vez, y esa combinación es la que habilita un
sistema coordinado en lugar de una colección de gráficos sueltos:

- **Espacial en dos registros.** Coordenadas puntuales para densidad y agrupamiento
  geográfico, más una jerarquía administrativa de tres niveles (departamento → provincia →
  distrito) para agregación y comparación entre territorios.
- **Temporal en varias escalas.** Cinco años de serie, más estacionalidad mensual, día de
  la semana y hora del día, que permiten pasar de la tendencia al patrón cotidiano.
- **Relacional y jerárquica.** Un siniestro contiene vehículos que contienen personas. Es
  el mismo hecho visto en tres granularidades, y permite pasar de "cuántos siniestros" a
  "quién muere" sin cambiar de dataset.
- **Multivariada y mayormente categórica.** Alrededor de sesenta atributos categóricos
  sobre infraestructura, vehículo y víctima, aptos para filtrado facetado y vistas enlazadas.

**Audiencia y decisión.** El destinatario natural son los equipos técnicos del ONSV, la ATU
y las gerencias municipales de movilidad, que deben priorizar intervenciones con
presupuesto limitado. La pregunta que la herramienta debe ayudar a responder no es
"¿cuántos muertos hubo?" sino **"¿qué tramo, a qué hora y para qué tipo de usuario
concentra el riesgo evitable?"**.

**Indicios preliminares.** Una primera exploración ya muestra tensiones que valen una
narrativa visual: el 57% de los siniestros fatales ocurre en zona rural y no en las
ciudades; la motocicleta supera al automóvil como vehículo más involucrado; y los peatones
representan 2,941 de los 10,859 fallecidos, pero la "imprudencia del peatón" se registra
como causa principal en apenas 593 casos frente a 3,497 por imprudencia del conductor.

---

## 6. Limitaciones conocidas

Estas limitaciones condicionan qué se puede afirmar con estos datos, y deben quedar
visibles en la aplicación final, no solo en la documentación.

1. **2024 y 2025 son preliminares.** La serie desciende de 2,480 siniestros en 2022 a
   1,555 en 2024 y 678 en 2025. Esa caída **no debe leerse como una mejora en seguridad
   vial**: es consistente con un registro aún incompleto. Cualquier vista temporal tiene
   que marcar esos años como provisionales.

2. **No hay denominador de exposición.** El dataset no incluye parque automotor,
   población ni vehículos-kilómetro, de modo que solo pueden calcularse conteos absolutos,
   nunca tasas. Comparar departamentos sin normalizar favorece mecánicamente a los más
   poblados. Mitigación prevista: cruzar con proyecciones de población del INEI a nivel
   distrital.

3. **La mitad de las causas está sin determinar.** 4,609 de 9,106 siniestros figuran como
   `EN PROCESO DE INVESTIGACIÓN`. Todo análisis causal se sostiene sobre la mitad de los
   casos, y la interfaz debe comunicarlo.

4. **El dosaje etílico está fuertemente subregistrado.** Solo 3,955 de 25,412 personas
   fueron sometidas a la prueba cualitativa; entre ellas, 631 dieron positivo. Sirve como
   señal, jamás como estimación de prevalencia. El valor cuantitativo en g/L no se publica.

5. **Sesgo de atribución de causa.** La causa la asigna la unidad policial que interviene,
   con criterio que puede variar entre unidades y en un contexto donde una de las partes
   suele estar fallecida y no puede declarar.

6. **Solo siniestros fatales.** Las bases detalladas excluyen los siniestros con heridos o
   daños materiales, así que no permiten estudiar la severidad como gradiente. La tabla
   histórica ayuda parcialmente al dar el total de siniestros de toda gravedad.

7. **Un código de persona duplicado.** `P-2023-04-103-1-2` aparece dos veces, asociado a
   dos vehículos distintos del mismo siniestro. Es semánticamente explicable —un peatón
   atropellado por dos vehículos— pero rompe la unicidad de la llave primaria. Se conserva
   sin modificar y se decidirá la regla de conteo en la Semana 6.

8. **Valores faltantes con varias formas.** Además de la celda vacía, las cadenas
   `NO SE CONOCE`, `NO REGISTRA`, `NO CORRESPONDE` y `NO APLICA` operan como faltantes, y
   no significan lo mismo: `NO CORRESPONDE` indica que el atributo no aplica al caso,
   mientras que `NO REGISTRA` indica ausencia de información. No deben colapsarse en un
   único valor nulo.

9. **Una coordenada incompleta.** El siniestro `A-2022-05-52` (San Juan de Tarucani,
   Arequipa) tiene latitud pero no longitud, por lo que no es mapeable.

10. **Los esquemas de categoría del histórico cambian entre años.** No es un error de
    procesamiento sino un cambio real de criterio de la fuente, y obliga a tratar las
    series como tramos comparables solo dentro de cada periodo:

    - **Franja horaria:** cuatro bloques de seis horas en 2008–2014, doce bloques de dos
      horas desde 2015. Las series no son comparables a través de 2015 sin reagrupar.
    - **Grupos etarios de fallecidos:** solo menor/mayor de 18 años en 2008–2009, seis
      grupos desde 2010.
    - **Causas:** once causas aparecen en los diecisiete años, pero otras diez existen
      solo en subconjuntos de años, y la taxonomía tampoco coincide con la de
      `siniestros.csv`. Además el origen escribe `EBRIEDAD DEL CONDUTOR` e
      `INVACIÓN DE CARRIL`, con las erratas incluidas; se conservan tal cual.

11. **Las hojas del libro histórico no cuadran entre sí.** El propio libro del ONSV es
    internamente inconsistente en tres años. `acquisition.py` lo verifica en cada
    ejecución y reporta:

    | Año | Total declarado | Suma de causas | Suma de franjas |
    |---|---|---|---|
    | 2008 | 85,337 | 85,337 | 86,026 |
    | 2009 | 86,026 | 83,653 | 85,337 |
    | 2013 | 101,762 | 102,762 | 102,762 |

    En 2008 y 2009 las cifras aparecen **intercambiadas** entre hojas: la hoja de franja
    horaria asigna a 2008 el total de 2009 y viceversa. En 2009 la hoja de causas repite
    el total de 2010. En 2013 ambas hojas exceden al total en exactamente 1,000, diferencia
    que se localiza íntegramente en Ica (907 según la hoja de totales, 1,907 según la de
    franja horaria) y que parece un dígito de más.

    Se verificó que **no es un error de parseo**: los bloques anuales se alinean
    exactamente con sus etiquetas de año en la hoja de origen. Los datos se entregan tal
    como los publica la fuente, sin corregir. Conviene evitar 2008, 2009 y 2013 en
    afirmaciones cuantitativas, o declarar explícitamente qué hoja se tomó como
    autoritativa.

---

## 7. Licencia y condiciones de uso

**El portal del ONSV no publica términos de uso ni licencia explícita** para estos
archivos. Se trata de información estadística producida por una entidad del Estado peruano
y difundida en su sección de datos abiertos, en el marco de la política nacional de datos
abiertos y de la Ley 27806 de Transparencia y Acceso a la Información Pública.

En consecuencia:

- El uso se limita a fines académicos y sin ánimo de lucro, con atribución explícita al
  ONSV y a la PNP como fuente.
- Los datos **no contienen información personal identificable**: no hay nombres, documentos
  de identidad ni placas. Los atributos de persona se restringen a edad, sexo, nacionalidad
  y rol en el siniestro.
- **Pendiente:** confirmar con el docente si esta declaración es suficiente para el
  requisito de licencia de la guía, o si conviene solicitar una confirmación formal al ONSV.

---

## 8. Reproducción

Requiere Python 3.9 o superior.

```bash
pip install pandas openpyxl requests

cd deliveries/week04
python acquisition.py            # descarga desde el ONSV y regenera todo
python acquisition.py --offline  # reprocesa lo ya descargado en raw/
```

El script descarga los cuatro Excel a `raw/`, los convierte a CSV, genera
`data_dictionary.csv` y ejecuta la validación de integridad, cuyo reporte imprime en
consola. Es idempotente: no vuelve a descargar un archivo que ya existe en `raw/`.

Las decisiones de transformación están explicadas en [`acquisition.md`](acquisition.md).

---

## 9. Equipo

| Integrante | Responsabilidad en esta entrega |
|---|---|
| *(por completar)* | Adquisición y procesamiento de datos |
| *(por completar)* | Diccionario de datos y control de calidad |
| *(por completar)* | Documentación y repositorio |

> Pendiente de completar antes de la entrega. La guía advierte que las contribuciones
> individuales deben quedar documentadas en el repositorio y que el historial de commits
> es la evidencia de colaboración.
