import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Eraser, Image as ImageIcon, Trash2, Loader2 } from 'lucide-react';
import { saveImage, getImages, deleteImage } from './lib/db';

interface Selection {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SavedImage {
  id: number;
  dataUrl: string;
  timestamp: number;
}

export default function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<SavedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const images = await getImages();
      setHistory(images);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const [isDragging, setIsDragging] = useState(false);

  // Handle file upload
  const processFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setImageSrc(src);
      
      const img = new Image();
      img.onload = () => {
        setImageObj(img);
        setSelection(null);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // Draw image and selection on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageObj) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to match image
    canvas.width = imageObj.width;
    canvas.height = imageObj.height;

    // Draw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageObj, 0, 0);

    // Draw selection if exists
    if (selection) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.3)'; // Red semi-transparent
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.fillRect(selection.x, selection.y, selection.w, selection.h);
      ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
    }
  }, [imageObj, selection]);

  // Mouse events for drawing selection
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    setIsDrawing(true);
    setStartPos(pos);
    setSelection({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const currentPos = getMousePos(e);
    
    setSelection({
      x: Math.min(startPos.x, currentPos.x),
      y: Math.min(startPos.y, currentPos.y),
      w: Math.abs(currentPos.x - startPos.x),
      h: Math.abs(currentPos.y - startPos.y)
    });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  // Remove watermark logic (Exemplar-based Inpainting / Criminisi)
  const removeWatermark = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !selection || !imageObj) return;

    setIsProcessing(true);
    // Yield to browser to render the loading state
    await new Promise(resolve => setTimeout(resolve, 50));

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsProcessing(false);
      return;
    }

    // Re-draw image without the red selection box first
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageObj, 0, 0);

    const { x, y, w, h } = selection;
    const width = canvas.width;
    const height = canvas.height;
    
    // Ensure bounds are within canvas, with 3-pixel dilation to remove anti-aliased edges
    const dilation = 3;
    const xMin = Math.max(0, Math.floor(x) - dilation);
    const yMin = Math.max(0, Math.floor(y) - dilation);
    const xMax = Math.min(width - 1, Math.floor(x + w) + dilation);
    const yMax = Math.min(height - 1, Math.floor(y + h) + dilation);

    if (xMax <= xMin || yMax <= yMin) {
      setIsProcessing(false);
      return;
    }

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // 1 = unknown (watermark), 0 = known (background)
    const mask = new Uint8Array(width * height);
    const originalMask = new Uint8Array(width * height);
    const confidence = new Float32Array(width * height);
    const grayscale = new Float32Array(width * height);

    let unknownCount = 0;
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const idx = py * width + px;
        const r = data[idx * 4];
        const g = data[idx * 4 + 1];
        const b = data[idx * 4 + 2];
        grayscale[idx] = 0.299 * r + 0.587 * g + 0.114 * b;

        if (px >= xMin && px < xMax && py >= yMin && py < yMax) {
          mask[idx] = 1;
          originalMask[idx] = 1;
          confidence[idx] = 0;
          unknownCount++;
        } else {
          mask[idx] = 0;
          originalMask[idx] = 0;
          confidence[idx] = 1;
        }
      }
    }

    // Dynamic patch size based on selection size, min 4 (9x9), max 7 (15x15)
    const patchRadius = Math.max(4, Math.min(7, Math.floor(Math.max(w, h) / 40)));
    let iterations = 0;

    const isPatchValid = (sx: number, sy: number) => {
      if (sx - patchRadius < 0 || sx + patchRadius >= width || sy - patchRadius < 0 || sy + patchRadius >= height) return false;
      for (let dy = -patchRadius; dy <= patchRadius; dy++) {
        for (let dx = -patchRadius; dx <= patchRadius; dx++) {
          // Strictly use originally known pixels as source to prevent error propagation
          if (originalMask[(sy + dy) * width + (sx + dx)] === 1) return false;
        }
      }
      return true;
    };

    // Core Algorithm: Exemplar-based Inpainting (Criminisi)
    // Uses proper Filling Order (Confidence * Data Term) + Confidence Decay + Randomness
    // This completely eliminates the "medial axis" and top-to-bottom seam artifacts.
    while (unknownCount > 0) {
      iterations++;
      // Yield to browser to prevent freezing and show progress dynamically
      if (iterations % 15 === 0) {
        ctx.putImageData(imgData, 0, 0);
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      // 1. Find boundary pixel with max Priority P(p) = C(p) * D(p)
      let bestTargetX = -1, bestTargetY = -1;
      let maxPriority = -1;
      let bestPatchConfidence = 0;

      for (let py = yMin; py < yMax; py++) {
        for (let px = xMin; px < xMax; px++) {
          if (mask[py * width + px] === 1) {
            // Check if it's on the boundary
            let isBoundary = false;
            if (px > 0 && mask[py * width + px - 1] === 0) isBoundary = true;
            else if (px < width - 1 && mask[py * width + px + 1] === 0) isBoundary = true;
            else if (py > 0 && mask[(py - 1) * width + px] === 0) isBoundary = true;
            else if (py < height - 1 && mask[(py + 1) * width + px] === 0) isBoundary = true;

            if (isBoundary) {
              // Calculate Confidence Term C(p)
              let confSum = 0;
              let patchArea = 0;
              for (let dy = -patchRadius; dy <= patchRadius; dy++) {
                for (let dx = -patchRadius; dx <= patchRadius; dx++) {
                  const nx = px + dx, ny = py + dy;
                  if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    confSum += confidence[ny * width + nx];
                    patchArea++;
                  }
                }
              }
              const Cp = confSum / patchArea;

              // Calculate Data Term D(p)
              // Normal vector (gradient of confidence)
              const cx1 = px < width - 1 ? confidence[py * width + px + 1] : confidence[py * width + px];
              const cx0 = px > 0 ? confidence[py * width + px - 1] : confidence[py * width + px];
              const cy1 = py < height - 1 ? confidence[(py + 1) * width + px] : confidence[py * width + px];
              const cy0 = py > 0 ? confidence[(py - 1) * width + px] : confidence[py * width + px];
              const nx = cx1 - cx0;
              const ny = cy1 - cy0;
              const nLen = Math.sqrt(nx * nx + ny * ny) || 1;
              const normX = nx / nLen;
              const normY = ny / nLen;

              // Isophote vector (perpendicular to image gradient)
              // Compute gradient using only known surrounding pixels
              let gradX = 0;
              let gradY = 0;
              let gradCount = 0;

              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  const nx_i = px + dx;
                  const ny_i = py + dy;
                  if (nx_i >= 0 && nx_i < width && ny_i >= 0 && ny_i < height && mask[ny_i * width + nx_i] === 0) {
                    const left = nx_i > 0 && mask[ny_i * width + nx_i - 1] === 0 ? grayscale[ny_i * width + nx_i - 1] : grayscale[ny_i * width + nx_i];
                    const right = nx_i < width - 1 && mask[ny_i * width + nx_i + 1] === 0 ? grayscale[ny_i * width + nx_i + 1] : grayscale[ny_i * width + nx_i];
                    const up = ny_i > 0 && mask[(ny_i - 1) * width + nx_i] === 0 ? grayscale[(ny_i - 1) * width + nx_i] : grayscale[ny_i * width + nx_i];
                    const down = ny_i < height - 1 && mask[(ny_i + 1) * width + nx_i] === 0 ? grayscale[(ny_i + 1) * width + nx_i] : grayscale[ny_i * width + nx_i];
                    
                    gradX += (right - left) / 2;
                    gradY += (down - up) / 2;
                    gradCount++;
                  }
                }
              }
              if (gradCount > 0) {
                gradX /= gradCount;
                gradY /= gradCount;
              }

              const isoX = -gradY;
              const isoY = gradX;

              const Dp = Math.abs(isoX * normX + isoY * normY) / 255.0 + 0.001;

              // Priority P(p) = C(p) * D(p)
              // Add randomness to break top-to-bottom traversal bias in flat regions
              const priority = Cp * Dp * (0.8 + Math.random() * 0.4);

              if (priority > maxPriority) {
                maxPriority = priority;
                bestTargetX = px;
                bestTargetY = py;
                bestPatchConfidence = Cp;
              }
            }
          }
        }
      }

      if (bestTargetX === -1) break; // Safety break

      // Precompute known pixels in the target patch for fast SSD
      const knownPixels = [];
      for (let dy = -patchRadius; dy <= patchRadius; dy++) {
        for (let dx = -patchRadius; dx <= patchRadius; dx++) {
          const tx = bestTargetX + dx;
          const ty = bestTargetY + dy;
          if (tx >= 0 && tx < width && ty >= 0 && ty < height && mask[ty * width + tx] === 0) {
            knownPixels.push({ dx, dy, tIdx: (ty * width + tx) * 4 });
          }
        }
      }

      // 2. Search for the best matching patch in the known region
      let bestSourceX = -1, bestSourceY = -1;
      let minSsd = Infinity;

      const candidates = [];
      // Exhaustive local search (radius 60)
      const localRadius = 60;
      const sxMin = Math.max(patchRadius, bestTargetX - localRadius);
      const sxMax = Math.min(width - patchRadius - 1, bestTargetX + localRadius);
      const syMin = Math.max(patchRadius, bestTargetY - localRadius);
      const syMax = Math.min(height - patchRadius - 1, bestTargetY + localRadius);
      
      for (let sy = syMin; sy <= syMax; sy += 2) {
        for (let sx = sxMin; sx <= sxMax; sx += 2) {
           candidates.push({x: sx, y: sy});
        }
      }
      // Random global search
      for(let i=0; i<300; i++) {
          const cx = Math.floor(Math.random() * (width - 2*patchRadius)) + patchRadius;
          const cy = Math.floor(Math.random() * (height - 2*patchRadius)) + patchRadius;
          candidates.push({x: cx, y: cy});
      }

      for (const cand of candidates) {
        const sx = cand.x, sy = cand.y;
        if (!isPatchValid(sx, sy)) continue;

        let ssd = 0;
        for (let i = 0; i < knownPixels.length; i++) {
          const kp = knownPixels[i];
          const sIdx = ((sy + kp.dy) * width + (sx + kp.dx)) * 4;
          const dr = data[kp.tIdx] - data[sIdx];
          const dg = data[kp.tIdx + 1] - data[sIdx + 1];
          const db = data[kp.tIdx + 2] - data[sIdx + 2];
          ssd += dr * dr + dg * dg + db * db;
          // Early abort optimization
          if (knownPixels.length > 0 && (ssd / knownPixels.length) >= minSsd) break; 
        }

        // Normalize SSD by number of known pixels
        let normalizedSsd = knownPixels.length > 0 ? ssd / knownPixels.length : Infinity;

        // Spatial Penalty: penalize patches that are far away
        const distSq = (sx - bestTargetX) * (sx - bestTargetX) + (sy - bestTargetY) * (sy - bestTargetY);
        const maxDistSq = width * width + height * height;
        const spatialPenalty = (distSq / maxDistSq) * 10000; // Weight coefficient
        normalizedSsd += spatialPenalty;

        if (normalizedSsd < minSsd) {
          minSsd = normalizedSsd;
          bestSourceX = sx;
          bestSourceY = sy;
        }
      }

      // 3. Copy ENTIRE patch of unknown pixels from source to target
      if (bestSourceX !== -1) {
        for (let dy = -patchRadius; dy <= patchRadius; dy++) {
          for (let dx = -patchRadius; dx <= patchRadius; dx++) {
            const tx = bestTargetX + dx;
            const ty = bestTargetY + dy;
            if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
              const idx = ty * width + tx;
              const tIdx = idx * 4;
              const sIdx = ((bestSourceY + dy) * width + (bestSourceX + dx)) * 4;
              
              if (mask[idx] === 1) {
                // Completely unknown pixel, hard copy
                data[tIdx] = data[sIdx];
                data[tIdx + 1] = data[sIdx + 1];
                data[tIdx + 2] = data[sIdx + 2];
                data[tIdx + 3] = 255;
                
                mask[idx] = 0;
                // CRITICAL: Confidence decay! New pixels inherit patch center's confidence
                confidence[idx] = bestPatchConfidence;
                grayscale[idx] = 0.299 * data[sIdx] + 0.587 * data[sIdx + 1] + 0.114 * data[sIdx + 2];
                
                unknownCount--;
              } else if (originalMask[idx] === 1) {
                // Already filled in a previous iteration, blend it to reduce seams (Alpha Blending)
                data[tIdx] = data[tIdx] * 0.5 + data[sIdx] * 0.5;
                data[tIdx + 1] = data[tIdx + 1] * 0.5 + data[sIdx + 1] * 0.5;
                data[tIdx + 2] = data[tIdx + 2] * 0.5 + data[sIdx + 2] * 0.5;
                grayscale[idx] = 0.299 * data[tIdx] + 0.587 * data[tIdx + 1] + 0.114 * data[tIdx + 2];
              }
            }
          }
        }
      } else {
        // Fallback: mark center as known to avoid infinite loop
        mask[bestTargetY * width + bestTargetX] = 0;
        confidence[bestTargetY * width + bestTargetX] = 0.01;
        unknownCount--;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Update the image object with the new processed image
    const newSrc = canvas.toDataURL('image/png');
    const newImg = new Image();
    newImg.onload = () => {
      setImageObj(newImg);
      setImageSrc(newSrc);
      setSelection(null);
      setIsProcessing(false);
    };
    newImg.src = newSrc;
  };

  // Download and save locally
  const handleDownload = async () => {
    if (!imageSrc) return;

    // Trigger download
    const link = document.createElement('a');
    link.href = imageSrc;
    link.download = `watermark-removed-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Save to local IndexedDB
    try {
      await saveImage(imageSrc);
      loadHistory();
    } catch (err) {
      console.error('Failed to save to local DB:', err);
    }
  };

  const handleDeleteHistory = async (id: number) => {
    try {
      await deleteImage(id);
      loadHistory();
    } catch (err) {
      console.error('Failed to delete image:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eraser className="w-6 h-6 text-indigo-600" />
          <h1 className="text-xl font-semibold">Watermark Remover</h1>
        </div>
        <div className="text-sm text-gray-500">Frontend-only processing</div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Editor Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Editor</h2>
              <div className="flex gap-3">
                <label className="cursor-pointer bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Upload Image
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                </label>
                
                {imageSrc && (
                  <>
                    <button
                      onClick={() => {
                        setImageSrc(null);
                        setImageObj(null);
                        setSelection(null);
                      }}
                      className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Clear Image
                    </button>
                    <button 
                      onClick={removeWatermark}
                      disabled={!selection || selection.w === 0 || isProcessing}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
                      {isProcessing ? 'Processing...' : 'Remove Watermark'}
                    </button>
                    <button 
                      onClick={handleDownload}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download & Save
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Canvas Container */}
            <div 
              className={`bg-gray-100 rounded-xl border-2 ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'} min-h-[400px] flex items-center justify-center overflow-hidden relative transition-colors`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {!imageSrc ? (
                <div className="text-center text-gray-400 p-8 pointer-events-none">
                  <ImageIcon className={`w-12 h-12 mx-auto mb-3 ${isDragging ? 'text-indigo-500' : 'opacity-50'}`} />
                  <p>{isDragging ? 'Drop image here' : 'Upload or drag an image to get started'}</p>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center">
                  <p className="text-xs text-gray-500 mb-2 mt-2">
                    Click and drag to select the watermark area
                  </p>
                  <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    className="max-w-full max-h-[60vh] object-contain cursor-crosshair shadow-sm border border-gray-300 bg-white"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Local History Section */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-full">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-gray-400" />
              Local Gallery
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Images you download are saved locally in your browser.
            </p>
            
            <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2">
              {history.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-8 border-2 border-dashed border-gray-100 rounded-xl">
                  No saved images yet
                </div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="group relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img 
                      src={item.dataUrl} 
                      alt="Saved" 
                      className="w-full h-40 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <a 
                        href={item.dataUrl} 
                        download={`watermark-removed-${item.timestamp}.png`}
                        className="p-2 bg-white rounded-full text-gray-900 hover:bg-gray-100 transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button 
                        onClick={() => handleDeleteHistory(item.id)}
                        className="p-2 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                      <div className="text-xs text-white/90">
                        {new Date(item.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
