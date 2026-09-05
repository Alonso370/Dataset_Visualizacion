# Adquisición y reproducibilidad

## Fuente
**US Accidents (2016–2023)**  
https://www.kaggle.com/datasets/sobhanmoosavi/us-accidents

## Obtención
1. Descargar el dataset desde Kaggle.
2. Descomprimir `US_Accidents_March23.csv`.
3. Mantener el archivo original localmente; no subir los ~3.06 GB al repositorio.
4. Ejecutar el script de muestreo por chunks utilizado por el equipo.
5. Generar `data/sample.csv` con 100 000 registros y las 46 columnas.

## Muestreo
El archivo original se procesa por bloques para evitar cargarlo completamente en memoria. Se utiliza una semilla fija (`5343`) para mantener la reproducibilidad.

## Evaluación
Sobre `sample.csv` se revisan dimensiones, tipos, valores faltantes, duplicados, IDs duplicados, distribución de Severity y rangos básicos de coordenadas y variables meteorológicas.

## Reproducibilidad
Otro integrante debe poder descargar el mismo archivo, ejecutar el procedimiento documentado y reconstruir la muestra y el análisis de calidad.

## Licencia
CC BY-NC-SA 4.0: https://creativecommons.org/licenses/by-nc-sa/4.0/
