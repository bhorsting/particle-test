# Font Setup Instructions

To use the Xiaomi Sans font for the 3D text, you need to convert it to Three.js JSON format.

## Steps:

1. **Download Xiaomi Sans font** (TTF or OTF format) from:
   - Official Xiaomi website: https://hyperos.mi.com/font/en/rare-word/
   - Or search for "Xiaomi Sans font download"

2. **Convert to Three.js JSON format** using one of these tools:
   - **Facetype.js** (recommended): https://gero3.github.io/facetype.js/
     - Upload the TTF/OTF file
     - Download the generated JSON file
     - Rename it to `xiaomi_sans.json`
     - Place it in this directory (`public/fonts/`)

3. **Alternative conversion tools**:
   - Three.js font converter scripts
   - Online font converters that support Three.js format

## File Location:
The font file should be placed at: `public/fonts/xiaomi_sans.json`

The application will automatically load this font when it starts. If the font file is not found, a warning will be logged to the console.

