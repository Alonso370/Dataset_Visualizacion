@echo off
python scripts\preprocess_7m.py --input "data\raw\US_Accidents_March23.csv" --output "data\processed"
if errorlevel 1 goto finish
python scripts\build_explorer.py --input "data\raw\US_Accidents_March23.csv" --output "data\explorer"
:finish
pause
