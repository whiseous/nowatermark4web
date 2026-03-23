# Pure Frontend Watermark Remover

[简体中文](./README.md) | [English](./README_en.md)

A powerful, privacy-preserving watermark removal tool built entirely with web technologies. This application runs a highly optimized **Exemplar-based Inpainting (Criminisi)** algorithm directly in your browser, requiring no backend server, cloud processing, or API calls.

## ✨ Features

- **100% Local Processing:** All image processing happens in your browser via the HTML5 Canvas API and JavaScript `Uint8Array` manipulation. Your images never leave your device, ensuring absolute privacy.
- **Advanced Inpainting Algorithm:** Uses a modern implementation of the Criminisi algorithm featuring:
  - **Patch-based Texture Synthesis:** Rebuilds complex backgrounds (grass, brick walls, textures) instead of just blurring them.
  - **Structure Preservation:** Intelligently prioritizes connecting broken lines and edges (Data Term & Confidence Term).
  - **Spatial Penalty & Alpha Blending:** Prevents large areas from becoming a single flat color and eliminates harsh seams when patches merge.
  - **Dynamic Patch Sizing:** Automatically adjusts the processing block size based on the watermark area.
- **Local Gallery:** Automatically saves your processed images to your browser's IndexedDB for easy access later.
- **Modern UI:** Built with React and Tailwind CSS for a clean, responsive, drag-and-drop experience.

## 🛠 Tech Stack

- **Framework:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Storage:** IndexedDB (Local Browser Storage)

---

## 🚀 How to Deploy

Since this is a **pure frontend application** (Single Page Application), deployment is incredibly simple. There is no backend Node.js server to maintain; you only need to host the static files.

### Prerequisites
- Node.js (v18 or higher recommended)
- npm (or yarn/pnpm)

### Local Development
1. Clone the repository and navigate to the project folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and visit the URL provided in the terminal (usually `http://localhost:3000` or `http://localhost:5173`).

### Production Build
To generate the production-ready static files:
```bash
npm run build
```
The optimized HTML, CSS, and JS files will be generated in the `dist/` directory.

### Deployment Options
You can deploy the contents of the `dist/` folder to any static hosting service:

- **Vercel / Netlify / Cloudflare Pages:** 
  Simply connect your Git repository. Set the build command to `npm run build` and the output directory to `dist`.
- **Nginx / Apache / Traditional Web Hosting:** 
  Copy the contents of the `dist/` folder directly to your web server's public root directory (e.g., `/var/www/html`).
- **GitHub Pages:** 
  Use the `gh-pages` npm package or GitHub Actions to deploy the `dist/` folder to your `gh-pages` branch.

---

## 📖 How to Use (Frontend Guide)

Using the application is straightforward and requires no technical knowledge from the end-user.

1. **Upload an Image:**
   - Click the **"Upload Image"** button at the top of the editor.
   - Alternatively, simply **drag and drop** an image file from your computer directly into the large gray canvas area.

2. **Select the Watermark:**
   - Once the image is loaded onto the canvas, your cursor will turn into a crosshair.
   - **Click and drag** your mouse over the watermark, text, or unwanted object to draw a red selection box.
   - *Tip: Try to keep the box as close to the watermark as possible. A smaller selection area processes much faster and yields more accurate results.*

3. **Remove Watermark:**
   - Click the purple **"Remove Watermark"** button.
   - The browser will begin the heavy mathematical processing. Because it runs locally, larger selections or very high-resolution images may take a few seconds. The button will show a "Processing..." spinner.
   - Once finished, the watermark will vanish, replaced by synthesized background texture.

4. **Download and Save:**
   - If you are satisfied with the result, click the green **"Download & Save"** button.
   - This performs two actions simultaneously:
     1. It triggers a standard browser download, saving the cleaned `.png` image to your computer.
     2. It saves the image to your browser's local database (IndexedDB).

5. **Manage Local Gallery:**
   - Look at the **"Local Gallery"** sidebar on the right.
   - Here you will see a history of all the images you have processed and saved on this specific browser.
   - Hover over any image in the gallery to reveal quick actions:
     - **Download icon:** Re-download the image to your computer.
     - **Trash icon:** Permanently delete the image from your browser's local storage.
   - *Note: Because this uses IndexedDB, clearing your browser's site data/cache will clear this gallery.*

<img width="1840" height="826" alt="image" src="https://github.com/user-attachments/assets/19401d08-ee5b-4991-aebb-cddad0b3a99e" />

<img width="1771" height="789" alt="image" src="https://github.com/user-attachments/assets/5cb5aa0e-d21c-4ba2-ad8a-f0715d62bc94" />
/>

The above is Gemini's description; in practice, it is not suitable for areas with high lighting, high saturation, or mixed color blocks.<img width="792" height="180" alt="image" src="https://github.com/user-attachments/assets/16f7d7f3-abf6-4dbd-847b-a5fa46151aa8" />
