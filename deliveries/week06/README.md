# Semana 6 — Análisis de datos y bocetos

**Patrones de los accidentes de tránsito de mayor impacto en Estados Unidos**
DS5343 · Visualización de Datos · UTEC · Semestre 2026-2
Prof. Germain García-Zanabria · 16 de septiembre de 2026

| Integrante | Responsabilidad en esta entrega |
|---|---|
| Gianella Araceli Lira Ñaupari | Limpieza y transformación de datos |
| Angel Ulises Tito Berrocal | Análisis de procedencia, validación de preguntas y `DataAnalysis.md` |
| Oscar Alonso Gomez Marin | Revisión de papers e inspiración de diseño |
| Gady Magdiel Enciso Gomez | Bocetos y diseño visual |

---

## Contenido de la entrega

| Componente | Archivo |
|---|---|
| Análisis de datos | `DataAnalysis.md` |
| Revisión de papers e interacciones planeadas | `Vizu_S6.pdf` + fuente `Vizu_S6.tex` |
| Papers revisados | `papers/` (4 PDF) |
| Código de procesamiento | `code/` (2 `.Rmd`) |
| Datos procesados | `data/processed/` (2 CSV) |
| Bocetos | `sketches/` |

```
deliveries/week06/
├── README.md
├── DataAnalysis.md
├── Vizu_S6.pdf
├── Vizu_S6.tex
├── code/
│   ├── limpieza_us_accidents.Rmd
│   └── 02_transformacion_us_accidents_final.Rmd
├── data/
│   └── processed/
│       ├── sample_reducido_limpio.csv
│       └── sample_reducido_transformado.csv
├── papers/
│   ├── 01_fan_2015_spatio_temporal_traffic_accidents.pdf
│   ├── 02_sunkpho_2020_highway_accidents.pdf
│   ├── 03_guo_2011_tripvista.pdf
│   └── 04_rodriguez_2022_jamvis.pdf
└── sketches/
    └── boceto_mapa_T1.jpeg
```

---

## Cómo reproducir los datos procesados

**Requisitos.** R ≥ 4.0 con los paquetes `tidyverse`, `lubridate` y `janitor`.

```r
install.packages(c("tidyverse", "lubridate", "janitor"))
```

**Punto de partida.** `deliveries/week04/data/sample_reducido.csv`, la muestra de 25 000 registros documentada en la entrega de la semana 4. Su procedencia y método de muestreo están en `deliveries/week04/`.

**Los dos scripts leen y escriben en su propio directorio**, sin rutas relativas. El procedimiento exacto es el siguiente.

1. Copiar `sample_reducido.csv` desde `deliveries/week04/data/` a `deliveries/week06/code/`.
2. Abrir `code/limpieza_us_accidents.Rmd` y ejecutarlo completo (*Knit* o *Run All*).
   → genera `sample_reducido_limpio.csv` en `code/`
3. Abrir `code/02_transformacion_us_accidents_final.Rmd` y ejecutarlo completo.
   → genera `sample_reducido_transformado.csv` en `code/`

Los dos CSV resultantes son idénticos a los publicados en `data/processed/`, que están ahí para poder consultarlos sin ejecutar nada.

**Resultado esperado.**

| Etapa | Filas | Columnas |
|---|---|---|
| Entrada | 25 000 | 46 |
| Después de la limpieza | 24 994 | 46 |
| Después de la transformación | 24 994 | 57 |

Se descartan 6 registros (0.02 %) por las validaciones descritas en la sección 3.1 de `DataAnalysis.md`.

> **Nota.** Las rutas de lectura y escritura están escritas sin directorio, así que los scripts deben ejecutarse desde la carpeta donde estén los CSV. Se parametrizarán para el Delivery 1.

---

## Preguntas de dominio y dónde está su evidencia

Las cinco preguntas incorporan la fuente de datos como variable de control. La justificación de ese cambio y la demostración de que cada una puede responderse con los datos disponibles están en la sección 5 de `DataAnalysis.md`.

| | Pregunta | Evidencia |
|---|---|---|
| **T1** | ¿Dónde y en qué periodos se concentran los accidentes de mayor impacto y cómo cambia este patrón según la fuente de datos? | `DataAnalysis.md`, sección 5, T1 |
| **T2** | ¿Qué condiciones meteorológicas caracterizan los accidentes de mayor impacto en una zona y periodo seleccionados? | `DataAnalysis.md`, sección 5, T2 |
| **T3** | ¿Cómo varían los accidentes de mayor impacto según la hora y el día de la semana en una zona y fuente seleccionadas? | `DataAnalysis.md`, sección 5, T3 |
| **T4** | ¿Qué características de infraestructura vial aparecen con mayor frecuencia en los accidentes de mayor impacto dentro de una misma fuente de datos? | `DataAnalysis.md`, sección 5, T4 |
| **T5** | ¿Qué diferencias existen entre dos regiones seleccionadas en sus patrones temporales, climáticos y viales cuando presentan una composición de fuentes comparable? | `DataAnalysis.md`, sección 5, T5 |

El resumen de qué soporta cada pregunta está en la sección 6 de `DataAnalysis.md` y las decisiones de diseño que se derivan del análisis aparecen destacadas dentro de cada apartado de la sección 5.

---

## Papers revisados

Reseñados en la sección 2 de `Vizu_S6.pdf`, con las visualizaciones que emplea cada uno y cómo informa el diseño de este proyecto. Los PDF están en `papers/`.

| | Referencia | Aporte al diseño |
|---|---|---|
| 1 | Fan, X., He, B., Wang, C., Li, J., Cheng, M., Huang, H. y Liu, X. (2015). *Big Data Analytics and Visualization with Spatio-Temporal Correlations for Traffic Accidents*. ICA3PP, LNCS 9529, pp. 255–268. | Granularidad espacial variable; vistas combinadas de espacio, tiempo y clima |
| 2 | Sunkpho, J. y Wipulanusat, W. (2020). *The Role of Data Visualization and Analytics of Highway Accidents*. Walailak J. Sci. Tech., 17(12), 1379–1389. | Dashboard con filtros compartidos entre vistas |
| 3 | Guo, H., Wang, Z., Yu, B., Zhao, H. y Yuan, X. (2011). *TripVista: Triple Perspective Visual Trajectory Analytics*. IEEE PacificVis, pp. 163–170. | Las tres perspectivas (espacial, temporal, multidimensional) y el principio de *brushing + linking* |
| 4 | Rodriguez, E., Ferreira, N. y Poco, J. (2022). *JamVis: exploration and visualization of traffic jams*. Eur. Phys. J. Spec. Top., 231, 1673–1687. | *Multiple linked views*, selección geográfica multiescala y filtrado temporal propagado |

**Inspiración visual adicional.** Barros, M. *Tracing Journeys: Visualizing 30 Years of Global Migration and Population Change*, proyecto interactivo en D3.js, `mmbarrosmigrationviz.netlify.app`. Reseñado en la sección 2.5 de `Vizu_S6.pdf`. No es un paper académico, sino que se usa como referencia de acabado, navegación y transición entre vista general y selección particular.

---

## Datos

**US Accidents (2016–2023)**, curado por Sobhan Moosavi, publicado en Kaggle bajo licencia **CC BY-NC-SA 4.0**.
https://www.kaggle.com/datasets/sobhanmoosavi/us-accidents

El conjunto completo (~7.7 millones de registros, 3.06 GB) no se versiona en el repositorio. Su procedimiento de adquisición y el método de muestreo están documentados en `deliveries/week04/`.

**`Severity` mide impacto sobre el flujo de tráfico, no gravedad de lesiones.** En toda la documentación del proyecto se habla de *accidentes de mayor impacto*, definidos como `Severity >= 3`.

---

## Limitaciones conocidas

1. El análisis se realizó sobre la muestra de 25 000 registros. **T3 requiere agregados sobre el conjunto completo** para alcanzar efectivos suficientes al cruzar hora × día por zona y fuente (`DataAnalysis.md`, sección 5, T3).
2. El dataset no incorpora ninguna medida de exposición al tráfico, así que ninguna vista presenta tasas de riesgo ni afirma dónde es más peligroso conducir.
3. La composición de las fuentes de reporte varía en el tiempo y entre estados y las fuentes no etiquetan la severidad con el mismo criterio. Esa es la razón por la que las cinco preguntas incorporan la fuente como control.
4. `End_Lat` y `End_Lng` faltan en el 44.3 % de los registros, lo que descarta representar el tramo de vía afectado.

El detalle completo está en la sección 7 de `DataAnalysis.md`.

---

**Repositorio:** https://github.com/Alonso370/Dataset_Visualizacion