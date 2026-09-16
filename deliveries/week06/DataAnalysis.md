# Análisis de datos — Semana 6

**Patrones de los accidentes de tránsito de mayor impacto en Estados Unidos**
DS5343 · Visualización de Datos · UTEC · Semestre 2026-2
Prof. Germain García-Zanabria · 16 de septiembre de 2026

| Integrante | Responsabilidad en esta entrega |
|---|---|
| Gianella Araceli Lira Ñaupari | Limpieza y transformación de datos |
| Angel Ulises Tito Berrocal | Análisis de procedencia, validación de preguntas y este documento |
| Oscar Alonso Gomez Marin | Revisión de papers e inspiración de diseño |
| Gady Magdiel Enciso Gomez | Bocetos y diseño visual |

La revisión de los cuatro papers y el plan de interacciones están en `Vizu_S6.pdf`, en esta misma carpeta. Este documento cubre los datos, qué se hizo con ellos, qué muestran y qué preguntas soportan realmente.

---

## 1. Propósito

La guía de la semana 6 pide demostrar, para cada pregunta de dominio, que la información necesaria puede derivarse del dataset. Este documento hace eso y documenta además el resultado principal de haber examinado los datos. La procedencia de los registros condiciona lo que puede afirmarse en las cinco preguntas, de modo que las cinco incorporan ahora la fuente de datos como variable de control explícita.

Ese cambio no es solo de forma. En su formulación anterior, tres de las cinco preguntas habrían producido conclusiones falsas a partir de datos correctos.

---

## 2. Datos de partida

**US Accidents (2016–2023)**, hecho por Sobhan Moosavi y publicado en Kaggle bajo licencia CC BY-NC-SA 4.0. El conjunto completo tiene alrededor de 7.7 millones de registros y 46 atributos. Se trabaja sobre la muestra reproducible de 25 000 registros documentada en `deliveries/week04/`.

Cobertura verificada sobre la muestra:

| | |
|---|---|
| Rango temporal | 2016-02-08 a 2023-03-31 (completo) |
| Estados | 49 |
| Ciudades | 3 870 |
| Fuentes | Source1: 13 921 · Source2: 10 799 · Source3: 274 |

`Severity` es una escala de 1 a 4 que mide impacto sobre el flujo de tráfico, no gravedad de lesiones. Esta distinción se mantiene en todo el documento, ya que hablamos de *accidentes de mayor impacto* y nunca de *accidentes severos*.

---

## 3. Procesamiento

Dos etapas en R, reproducibles desde `code/`:

```
sample_reducido.csv  (25 000 × 46)
        │  limpieza_us_accidents.Rmd
        ▼
sample_reducido_limpio.csv  (24 994 × 46)
        │  02_transformacion_us_accidents_final.Rmd
        ▼
sample_reducido_transformado.csv  (24 994 × 57)
```

`Source` se conserva explícitamente como variable de control, no como un atributo más. La sección 4.3 explica por qué esa decisión determina el resto del análisis.

### 3.1 Limpieza

Estandarización de nombres, eliminación de duplicados exactos y por `ID`, recorte de espacios en variables de texto, conversión de `Start_Time`, `End_Time` y `Weather_Timestamp` a fecha-hora y cuatro validaciones. Los campos esenciales deben estar presentes (`ID`, `Severity`, `Start_Time`, `Start_Lat`, `Start_Lng`, `State`), `Severity` debe caer dentro de 1–4, las coordenadas deben estar en rango y `End_Time` no puede ser anterior a `Start_Time`.

Se perdieron 6 registros de 25 000 (0.02 %). La muestra ya venía validada desde la semana 4 y este resultado lo confirma de nuevo.

Decisión deliberada. No se eliminan registros por faltantes meteorológicos, ya que un accidente sin dato de precipitación sigue siendo útil para las vistas espacial y temporal. El tratamiento de nulos se resuelve por vista y no globalmente.

### 3.2 Variables derivadas

Once columnas nuevas:

| Variable | Contenido |
|---|---|
| `severity_level` | Baja (1) · Media (2) · Alta (3–4) |
| `high_impact` | booleano, `Severity >= 3` |
| `year`, `month`, `month_name` | escala anual y mensual |
| `day_of_week`, `is_weekend` | escala semanal |
| `hour`, `time_of_day` | hora y franja (Madrugada / Mañana / Tarde / Noche) |
| `season` | estación del hemisferio norte |
| `weather_group` | 60 categorías consolidadas en 6 |

No se construye un índice agregado de infraestructura. Las variables de entorno vial se conservan como indicadores separados, porque sumar `Junction`, `Crossing` y `Traffic_Signal` en un contador único sugeriría una escala de infraestructura que no tiene interpretación directa.

`high_impact` agrupa `Severity` 3 y 4, que son 4 774 registros (4 138 + 636) y representan el 19.1 % de la muestra.

> **Por qué `>= 3` y no `Severity = 4`.** Se evaluaron ambas definiciones.
>
> **Razón metodológica:** Las tres fuentes no usan los niveles 3 y 4 con el mismo significado, ya que Source3 no emplea el 4 en ningún registro. Agrupar 3 y 4 es lo que las vuelve comparables. El detalle está en la sección 4.3.
>
> **Razón de distribución:** `Severity` 2 concentra el 79.96 % de los registros, así que 3 y 4 juntos (19.1 %) constituyen la cola alta frente al caso corriente. Restringir a `Severity = 4` deja 636 registros (2.54 %), insuficientes para las preguntas, ya que 7 estados quedan sin un solo caso y 21 de los 42 restantes con menos de diez. `Storm` se reduce a 5 casos y Carolina del Sur a 10, lo que deja T5 sin efectivos para comparar perfiles.

La consolidación de `Weather_Condition` funcionó bien y cierra uno de los riesgos técnicos declarados en la propuesta. De 60 categorías originales quedan 6 grupos, con solo 13 registros en «Other» (0.05 %) y 544 nulos (2.2 %).

| `weather_group` | n |
|---|---|
| Clear / Fair | 11 073 |
| Cloudy | 10 182 |
| Rain | 1 760 |
| Fog / Low visibility | 649 |
| Snow / Ice | 551 |
| Storm | 222 |
| Other | 13 |

---

## 4. Comprensión de los datos

### 4.1 Faltantes

Solo cinco variables superan el 5 % de ausencia:

| Variable | % faltante | Consecuencia |
|---|---|---|
| `End_Lat` / `End_Lng` | 44.3 % | Descarta representar el *tramo* afectado, así que se usa el punto de inicio |
| `Precipitation(in)` | 28.1 % | Se usa `weather_group` en lugar de la lámina de lluvia |
| `Wind_Chill(F)` | 25.6 % | No se usa |
| `Wind_Speed(mph)` | 7.3 % | Utilizable con reserva |

Las variables que sostienen las cinco preguntas (`State`, `Start_Lat`, `Start_Lng`, `Start_Time`, `Severity`, `Weather_Condition` y los booleanos de entorno vial) no tienen faltantes tras la limpieza.

### 4.2 Booleanos de entorno vial

De los trece disponibles, solo seis superan el 1 % de presencia y son analizables:

| Variable | % True | | Variable | % True |
|---|---|---|---|---|
| `Traffic_Signal` | 15.21 % | | `Railway` | 0.98 % |
| `Crossing` | 11.69 % | | `Give_Way` | 0.45 % |
| `Junction` | 7.40 % | | `No_Exit` | 0.22 % |
| `Stop` | 2.89 % | | `Traffic_Calming` | 0.08 % |
| `Station` | 2.69 % | | `Bump` | 0.03 % |
| `Amenity` | 1.34 % | | `Roundabout` | 0.01 % |
| | | | `Turning_Loop` | 0.00 % |

`Turning_Loop` es constante y `Roundabout` aparece en 3 registros de 24 994. Ninguno puede codificarse.

Las seis variables usables (`Traffic_Signal`, `Crossing`, `Junction`, `Stop`, `Station` y `Amenity`) son las que sostienen T4. `Roundabout` queda excluida del análisis por su variación despreciable, mientras que `Railway` se conserva como indicador pero al 0.98 % no admite desagregación por zona o fuente.

### 4.3 El hallazgo que condiciona todo lo demás

Las dos fuentes principales no etiquetan la severidad con el mismo criterio:

| Fuente | n | % de sus registros con alto impacto |
|---|---|---|
| Source1 | 13 921 | 7.97 % |
| Source2 | 10 799 | 32.98 % |
| Source3 | 274 | 37.59 % |

Un registro de Source2 tiene cuatro veces más probabilidad de estar marcado como de alto impacto que uno de Source1.

La razón aparece al abrir la escala completa, ya que cada fuente la usa de una manera distinta:

| Fuente | Sev 1 | Sev 2 | Sev 3 | Sev 4 |
|---|---|---|---|---|
| Source1 | 0.69 % | 91.34 % | 3.84 % | 4.13 % |
| Source2 | 1.20 % | 65.81 % | 32.42 % | 0.56 % |
| Source3 | 2.92 % | 59.49 % | 37.59 % | 0.00 % |

Source1 emplea el nivel 4 más que el 3. Source2 emplea el 3 casi sesenta veces más que el 4. Source3 no emplea el nivel 4 ni una sola vez en 274 registros.

Lo que un proveedor etiqueta como 4, otro lo etiqueta como 3. Los niveles 3 y 4 no designan grados distintos de un mismo criterio, sino la misma categoría bajo convenciones distintas. Agruparlos en `high_impact` no es una simplificación, sino lo que vuelve comparables las tres fuentes. Tratar `Severity = 4` como categoría propia produciría un subconjunto en el que el 90.4 % de los casos proviene de Source1, y que mediría una convención de etiquetado antes que una propiedad de los accidentes.

La composición de fuentes además cambia radicalmente a lo largo del período:

| Año | n | % alto impacto | % Source1 | % Source2 |
|---|---|---|---|---|
| 2016 | 1 350 | 33.4 | 30.7 | 68.5 |
| 2017 | 2 249 | 34.9 | 22.8 | 76.2 |
| 2018 | 2 842 | 35.4 | 18.9 | 80.3 |
| 2019 | 3 102 | 27.1 | 27.2 | 71.1 |
| 2020 | 3 836 | 18.6 | 58.6 | 39.5 |
| 2021 | 5 007 | 11.7 | 70.2 | 28.9 |
| 2022 | 5 776 | 6.4 | 86.8 | 12.4 |
| 2023 | 832 | 2.8 | 100.0 | 0.0 |

La proporción de accidentes de mayor impacto cae doce veces entre 2016 y 2023. No es un fenómeno vial, sino que dejó de reportar el proveedor que etiquetaba alto. En 2023 el 100 % de los registros viene de Source1.

Esa es la razón por la que el resto del documento evalúa cada pregunta dentro de cada fuente y no solo sobre el agregado.

---

## 5. Validación pregunta por pregunta

Las cinco preguntas incorporan la fuente de datos como variable de control explícita. Esta sección demuestra que esa decisión no es formal, ya que sin ella tres de las cinco producirían conclusiones falsas.

### T1 · ¿Dónde y en qué periodos se concentran los accidentes de mayor impacto, y cómo cambia este patrón según la fuente de datos?

Es respondible y contiene el hallazgo más original del proyecto.

Sobre el agregado, la proporción de accidentes de mayor impacto cae de 33.4 % en 2016 a 2.8 % en 2023 (sección 4.3). Desagregada por fuente, la caída se explica y aparece algo que el agregado escondía:

| Año | Source1 | n | Source2 | n |
|---|---|---|---|---|
| 2016 | 29.0 % | 414 | 35.6 % | 925 |
| 2017 | 32.4 % | 513 | 35.2 % | 1 713 |
| 2018 | 34.5 % | 537 | 35.3 % | 2 282 |
| 2019 | 20.9 % | 845 | 29.2 % | 2 204 |
| 2020 | 9.7 % | 2 247 | 30.9 % | 1 514 |
| 2021 | 2.6 % | 3 517 | 33.3 % | 1 445 |
| 2022 | 2.6 % | 5 016 | 32.4 % | 716 |
| 2023 | 2.8 % | 832 | — | 0 |

Source2 se mantiene estable en torno al 32 % durante siete años. Source1 cae once veces, de 34.5 % en 2018 a 2.6 % en 2021, con un descenso gradual concentrado entre 2019 y 2021.

Son dos fenómenos superpuestos. Cambió la mezcla de proveedores y además Source1 cambió su propio criterio de etiquetado. Ninguno de los dos es un fenómeno vial. La serie agregada del período no describe accidentes, sino la historia de la recolección.

> **Decisión de diseño.** La vista temporal no se presenta agregada. Muestra una serie por fuente, que es lo que la pregunta pide y lo único que puede leerse sin inducir a error. Esta vista es, de hecho, el argumento metodológico del proyecto.

**En el eje espacial.**

Por estado, la distribución es fuertemente desigual. California concentra 5 486 registros (22 %) y 19 de los 49 estados tienen menos de 100. Un mapa que los pinte a todos con el mismo peso visual presenta más de un tercio del territorio como ruido estadístico.

Existe además una decisión de codificación que cambia el mapa por completo. La correlación entre el volumen de registros de un estado y su proporción de accidentes de mayor impacto es r = −0.291, o sea negativa. Los dos mapas posibles son casi opuestos.

| Codificando conteo, los más oscuros | Codificando proporción, los más oscuros |
|---|---|
| CA (5 486), FL (3 002), TX (1 862) | GA (44.0 %), CO (41.5 %), IL (36.7 %) |

Florida es el caso claro. Segundo estado por volumen, pero solo 12.3 % de accidentes de mayor impacto, de los más bajos del país.

> **Decisión de diseño.** El mapa codifica proporción dentro de cada estado, no conteo, así que cada estado es su propio denominador. Un mapa de conteos mostraría dónde hay más tráfico y mejor cobertura de recolección, no dónde los accidentes son de mayor impacto. El proyecto declaró explícitamente que no afirmará qué estado es más peligroso. Los estados por debajo de un umbral mínimo de registros se representan en gris, no en la escala de color.

---

### T2 · ¿Qué condiciones meteorológicas caracterizan los accidentes de mayor impacto en una zona y periodo seleccionados?

Es la pregunta más sólida del conjunto. El patrón se mantiene al controlar por fuente:

| `weather_group` | n | % alto impacto | Source1 | Source2 |
|---|---|---|---|---|
| Rain | 1 760 | 23.1 | 9.2 | 38.2 |
| Snow / Ice | 551 | 22.0 | 9.6 | 45.9 |
| Cloudy | 10 182 | 20.9 | 9.4 | 33.0 |
| Fog / Low visibility | 649 | 19.0 | 7.4 | 33.2 |
| Storm | 222 | 17.1 | 6.8 | 37.8 |
| Clear / Fair | 11 073 | 16.5 | 6.4 | 31.1 |

Snow / Ice es el máximo y Clear / Fair el mínimo en ambas fuentes por separado. Las magnitudes difieren, el orden no. El patrón climático es un hallazgo defendible y no un artefacto de procedencia.

Advertencia de tamaño. `Storm` (222) y `Snow / Ice` (551) son grupos pequeños. Al filtrar por estado y período pueden quedar en decenas de registros, y la vista debe mostrar el `n` o suprimir el grupo por debajo de un mínimo.

---

### T3 · ¿Cómo varían los accidentes de mayor impacto según la hora y el día de la semana en una zona y fuente seleccionadas?

Es respondible, pero no con la muestra, ya que exige agregados sobre el conjunto completo.

El patrón existe y el control por fuente está justificado. Por franja horaria, el agregado muestra una variación modesta (Noche 21.7 %, Mañana 18.6 %, Tarde 18.5 %, Madrugada 18.0 %), pero diluye el patrón porque las fuentes tienen composición horaria distinta:

| Franja | Source1 | Source2 |
|---|---|---|
| Noche | 9.4 | 42.9 |
| Madrugada | 9.6 | 33.1 |
| Tarde | 6.7 | 37.1 |
| Mañana | 8.2 | 26.3 |

La dirección coincide (la noche es alta en ambas) pero la magnitud es incomparable y el orden intermedio se reordena. Desagregar por fuente, como pide la pregunta, es lo correcto.

**El límite es de granularidad.** La pregunta cruza hora × día de la semana (168 celdas) filtrando además por zona y fuente. En California con Source1, que es la combinación más poblada de la muestra, hay 3 501 registros, de los cuales 102 son de mayor impacto. Eso da 0.6 casos por celda.

> **Consecuencia.** T3 no es respondible sobre la muestra de 25 000. Sí lo es sobre el conjunto completo de 7.7 millones, que multiplica por unas 300 veces los efectivos por celda. Esto confirma la necesidad de los agregados precalculados que la propuesta anticipó como enfoque de implementación, y no es un problema del dataset sino del tamaño de la muestra de trabajo.
>
> Mientras tanto, la vista debe degradar con elegancia y agregar a franja horaria cuando el cruce hora × día quede por debajo de un mínimo de efectivos, mostrando siempre el `n` de la selección.

**Nota.** La versión anterior de esta pregunta incluía la época del año. Se retiró con buen criterio, porque las dos fuentes se contradicen por estación. Para Source1 el invierno es el mínimo (6.3 %) y para Source2 es prácticamente el máximo (33.7 %), de modo que una vista estacional agregada promediaría dos señales opuestas.

---

### T4 · ¿Qué características de infraestructura vial aparecen con mayor frecuencia en los accidentes de mayor impacto dentro de una misma fuente de datos?

La restricción «dentro de una misma fuente» que añade la pregunta no es un matiz, sino lo que la hace respondible. Sin ella, esta vista produce una conclusión falsa.

| Variable | n (True) | Global: sin → con | Source1 | Source2 |
|---|---|---|---|---|
| `Junction` | 1 849 | 18.4 → 28.0 | 7.4 → 13.7 | 31.6 → 60.0 |
| `Traffic_Signal` | 3 801 | 21.0 → 8.8 | 7.9 → 8.8 | 40.1 → 8.6 |
| `Crossing` | 2 921 | 20.7 → 6.7 | 8.2 → 6.0 | 37.6 → 7.1 |
| `Stop` | 723 | 19.5 → 6.5 | 8.0 → 7.5 | 33.9 → 5.2 |
| `Station` | 673 | 19.4 → 7.3 | 8.0 → 5.0 | 33.7 → 9.4 |
| `Amenity` | 334 | 19.2 → 8.1 | 7.9 → 10.6 | 33.4 → 5.8 |

Se desprenden dos lecturas distintas.

**`Junction` es el hallazgo robusto.** Es la única variable donde la proporción sube, y sube en ambas fuentes. Pasa de 7.4 % a 13.7 % en Source1 y de 31.6 % a 60.0 % en Source2. Los accidentes en intersecciones son de mayor impacto con independencia de quién los reporte.

**`Traffic_Signal` es la trampa.** Leído sobre el agregado, el gráfico dice que la presencia de semáforo reduce el impacto de 21.0 % a 8.8 %, una conclusión atractiva y falsa. Desagregado, en Source1 el efecto no existe (7.9 % → 8.8 %, sube levemente) y en Source2 la proporción se desploma de 40.1 % a 8.6 %. La caída global la produce íntegramente una fuente.

La explicación más plausible es que estas variables funcionan como proxy del tipo de vía. Source2 parece cubrir sobre todo vías de alta capacidad, sin semáforos ni cruces peatonales, donde un incidente bloquea más tráfico. Cuando aparece un semáforo el registro corresponde a vía urbana y cae al perfil de Source1. `Amenity` lo confirma en negativo, ya que es la única variable donde las dos fuentes apuntan en direcciones opuestas (sube en Source1 y baja en Source2).

> **Decisión de diseño.** La vista de infraestructura no presenta un ranking único sobre el agregado. Muestra el contraste presencia/ausencia dentro de la fuente seleccionada, y `Junction` se destaca como el único patrón que sobrevive al control.

**Efectivos disponibles.** Source1 aporta 1 109 registros de mayor impacto y Source2 aporta 3 562. Ambos son suficientes para las seis variables usables. Con la definición restrictiva `Severity = 4`, Source2 quedaría en 61 casos y la pregunta sería irrespondible en esa fuente.

---

### T5 · ¿Qué diferencias existen entre dos regiones seleccionadas en sus patrones temporales, climáticos y viales cuando presentan una composición de fuentes comparable?

Es respondible y arroja un resultado que valida el enfoque, pero solo si las regiones se eligen con criterio.

La composición de fuentes varía enormemente entre estados, desde 15.7 % de Source1 en Oklahoma hasta 85.9 % en Oregón. Comparar dos estados con mezclas tan distintas mide proveedores, no lugares.

Al restringir a estados con composición comparable, la variación regional persiste:

| Estado | n | % Source1 | % alto impacto |
|---|---|---|---|
| Texas | 1 862 | 38.2 | 21.4 |
| Ohio | 352 | 38.9 | 30.7 |
| Michigan | 532 | 39.3 | 30.3 |
| Carolina del Sur | 1 167 | 39.6 | 11.2 |
| Washington | 347 | 40.1 | 30.5 |

Carolina del Sur y Ohio tienen prácticamente la misma mezcla de fuentes (39.6 % y 38.9 % de Source1) y sin embargo presentan 11.2 % frente a 30.7 % de accidentes de mayor impacto, casi el triple. Esa diferencia no la explica el proveedor, sino que es una diferencia regional real.

> **Decisión de diseño.** La comparación A/B prioriza pares de estados con composición de fuentes similar, y la interfaz muestra esa composición junto a cada perfil para que el usuario pueda juzgar si la comparación es legítima. Comparar California (63.8 % Source1, 16.9 % alto impacto) con Georgia (42.9 %, 44.0 %) mezclaría efecto de proveedor con efecto regional.

---

## 6. Síntesis: qué resiste y qué no

| | Pregunta | Veredicto |
|---|---|---|
| **T1** | Espacio + tiempo + fuente | Respondible. La desagregación por fuente es el hallazgo |
| **T2** | Clima | Respondible. El orden se mantiene dentro de cada fuente |
| **T4** | Infraestructura por fuente | Respondible. `Junction` es el patrón robusto |
| **T5** | Comparación regional | Respondible con pares de composición comparable |
| **T3** | Hora × día por zona y fuente | Respondible sobre el conjunto completo, no sobre la muestra |

Las cinco preguntas son respondibles. La única restricción abierta es de granularidad, no de validez, ya que T3 exige agregados sobre los 7.7 millones.

Conviene registrar por qué. En su formulación anterior, tres de las cinco habrían producido lecturas falsas. Una serie temporal que medía la historia de la recolección, una vista estacional que promediaba señales opuestas y un gráfico que atribuía a los semáforos un efecto inexistente. Incorporar la fuente de datos como variable de control dentro de cada pregunta es lo que las vuelve defendibles, y es el cambio principal que produjo el examen de los datos.

---

## 7. Limitaciones

1. **No existe medida de exposición.** El dataset no incorpora volumen vehicular, población ni kilómetros recorridos. Ninguna vista presenta tasas de riesgo ni afirma dónde es más peligroso conducir.
2. **`Severity` mide impacto sobre el tráfico, no gravedad de lesiones.** Debe declararse en la interfaz, no solo en la documentación.
3. **La procedencia condiciona la comparabilidad** (sección 4.3), tanto en el tiempo como entre estados.
4. **Cobertura geográfica desigual.** 19 estados con menos de 100 registros en la muestra.
5. **El análisis se hizo sobre 25 000 registros.** Las magnitudes pueden moverse al recalcular sobre los 7.7 millones, aunque la dirección de los hallazgos se verificó previamente sobre el conjunto completo y se mantuvo.
6. **`End_Lat` y `End_Lng` faltan en el 44.3 %**, lo que descarta representar el tramo de vía afectado.

---

## 8. Reproducción

```
deliveries/week06/
├── DataAnalysis.md          este documento
├── Vizu_S6.pdf              revisión de papers e interacciones
├── code/
│   ├── limpieza_us_accidents.Rmd
│   └── 02_transformacion_us_accidents_final.Rmd
├── data/processed/
│   ├── sample_reducido_limpio.csv
│   └── sample_reducido_transformado.csv
├── papers/                  los cuatro PDF revisados
└── sketches/                bocetos por pregunta
```

Ejecutar `limpieza_us_accidents.Rmd` con `sample_reducido.csv` en el mismo directorio y después `02_transformacion_us_accidents_final.Rmd`. Requiere R con `tidyverse`, `lubridate` y `janitor`. Las cifras de este documento se obtuvieron sobre `sample_reducido_transformado.csv`.

---

## 9. Pendientes para el Delivery 1

1. **Generar los agregados sobre el conjunto completo de 7.7 millones.** Es el requisito que habilita T3 y el que la aplicación necesita para no cargar el detalle en el navegador.
2. Fijar el umbral mínimo de registros por estado para el mapa, y el de efectivos por celda para el cruce hora × día.
3. Reconfirmar sobre el conjunto completo los hallazgos obtenidos en la muestra, en particular el cambio de criterio de Source1 entre 2019 y 2021 (sección 5, T1).
4. Decidir si la iluminación (`Sunrise_Sunset`, `Civil_Twilight`) se incorpora. Está limpia y disponible, y el plan de interacciones la menciona, pero no figura en las preguntas.
5. Determinar el tratamiento de Alaska y Hawái en el mapa, y el de los 19 estados por debajo de 100 registros.

---

**Fuente de datos:** Moosavi, S. *US Accidents (2016–2023)*, Kaggle. CC BY-NC-SA 4.0.