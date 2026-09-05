# Evaluación inicial de la calidad de los datos

## Alcance
Se evaluó una muestra reproducible de **100 000 registros y 46 variables** del conjunto US Accidents (2016–2023).

## Duplicados
- Filas duplicadas: **0**
- IDs duplicados: **0**

## Valores faltantes
| Variable | Faltantes | Porcentaje |
|---|---:|---:|
| End_Lng | 44 046 | 44.05 % |
| End_Lat | 44 046 | 44.05 % |
| Precipitation(in) | 28 549 | 28.55 % |
| Wind_Chill(F) | 25 925 | 25.92 % |
| Wind_Speed(mph) | 7 272 | 7.27 % |
| Visibility(mi) | 2 281 | 2.28 % |
| Wind_Direction | 2 245 | 2.24 % |
| Weather_Condition | 2 230 | 2.23 % |
| Humidity(%) | 2 225 | 2.22 % |
| Temperature(F) | 2 086 | 2.09 % |
| Pressure(in) | 1 793 | 1.79 % |
| Weather_Timestamp | 1 541 | 1.54 % |

Los principales problemas de ausencia se concentran en las coordenadas finales y algunas variables meteorológicas. Estos campos no deben eliminarse automáticamente sin considerar las visualizaciones que se desarrollarán.

## Tipos de datos
Las variables numéricas fueron reconocidas como `int64` o `float64`, las variables contextuales de presencia/ausencia como `bool` y las variables categóricas como `object`.

`Start_Time`, `End_Time` y `Weather_Timestamp` fueron leídas como `object`; deberán convertirse a `datetime` antes del análisis temporal.

## Severity
| Nivel | Registros | Porcentaje |
|---:|---:|---:|
| 1 | 908 | 0.91 % |
| 2 | 79 842 | 79.84 % |
| 3 | 16 703 | 16.70 % |
| 4 | 2 547 | 2.55 % |

No existen valores fuera del rango 1–4. Se observa una concentración importante en Severity 2, aspecto que deberá considerarse en las comparaciones visuales.

## Validaciones de consistencia
| Validación | Inválidos |
|---|---:|
| Latitud fuera de [-90, 90] | 0 |
| Longitud fuera de [-180, 180] | 0 |
| Humedad fuera de [0, 100] | 0 |
| Distancia negativa | 0 |
| Visibilidad negativa | 0 |
| Velocidad del viento negativa | 0 |
| Precipitación negativa | 0 |
| Severity fuera de [1, 4] | 0 |

## Valores extremos para revisión
Se observaron máximos de 153.11 millas en `Distance(mi)`, 100 millas en `Visibility(mi)`, 130 mph en `Wind_Speed(mph)` y 10.04 pulgadas en `Precipitation(in)`. No se clasifican automáticamente como errores porque las validaciones realizadas no permiten demostrarlo; deberán revisarse según su contexto.

## Limitaciones
1. Existen valores faltantes relevantes en determinadas variables.
2. Los timestamps necesitan transformación a `datetime`.
3. La fuente advierte posibles días sin datos por problemas de conectividad.
4. Los conteos de accidentes no equivalen directamente a tasas de riesgo.
5. `Severity` mide impacto sobre el tráfico, no gravedad médica.
6. Las relaciones observadas entre clima, entorno y accidentes son asociaciones y no demuestran causalidad.

## Conclusión
La muestra presenta una calidad inicial adecuada: no se encontraron duplicados, IDs repetidos ni valores fuera de los rangos básicos evaluados. Los principales aspectos a gestionar son los valores faltantes y las transformaciones temporales. El conjunto se considera viable para continuar con el proyecto.
