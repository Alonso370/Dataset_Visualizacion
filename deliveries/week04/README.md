# US Accidents (2016–2023) — Selección del conjunto de datos

## Fuente y responsables
- **Fuente:** Kaggle — US Accidents (2016–2023)
- **Autor/curador principal:** Sobhan Moosavi
- **Fecha de acceso:** 5 de septiembre de 2026
- **Cobertura temporal:** febrero de 2016 a marzo de 2023
- **Cobertura geográfica:** 49 estados de Estados Unidos
- **Tamaño:** aproximadamente 7.7 millones de registros, 46 atributos y 3.06 GB.

## Método de recolección
Según la documentación de la fuente, los registros fueron recopilados mediante múltiples APIs de eventos de tráfico que integran información de departamentos de transporte, organismos de seguridad, cámaras y sensores de tráfico. El conjunto incorpora además información temporal, geográfica, meteorológica y del entorno vial.

## Licencia
**CC BY-NC-SA 4.0.** Su uso requiere atribución, es no comercial y las adaptaciones deben compartirse bajo la misma licencia.

## Relevancia para visualización
El dataset es adecuado porque combina información **espacial, temporal y multivariada**. Incluye coordenadas, estados y ciudades; fechas y horas; severidad; variables meteorológicas; y características del entorno vial. Esto permite desarrollar mapas, patrones temporales, comparaciones regionales y vistas interactivas coordinadas.

`Severity` representa el **impacto sobre el tráfico**, no la gravedad de lesiones. Su escala va de 1 a 4.

## Organización
Debido al tamaño del archivo original, se utiliza una muestra reproducible de **100 000 registros y 46 columnas**. El repositorio debe incluir `data/sample.csv`, `diccionario_datos.csv`, `adquisicion.md` y `evaluacion_calidad_datos.md`.

## Limitaciones iniciales
La fuente advierte que pueden existir días sin registros debido a problemas de conectividad durante la recolección. Además, los conteos no representan por sí mismos tasas de riesgo porque el dataset no incorpora una medida homogénea de exposición al tráfico.

## Enlaces
Dataset: https://www.kaggle.com/datasets/sobhanmoosavi/us-accidents  
Licencia: https://creativecommons.org/licenses/by-nc-sa/4.0/

## Equipo

| Integrante | Responsabilidad en esta entrega |
|---|---|
| Oscar Alonso Gomez Mari | Data & Analysis |
| Gianella Araceli Lira Ñaupari | Data & Analysis |
| Gady Magdiel Enciso Gomez | Visualization & Design |
| Angel Ulises Tito Berrocal | D3 & Implementation |
