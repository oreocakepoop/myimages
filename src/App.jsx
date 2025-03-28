import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MagnifyingGlassIcon, PhotoIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

// Key for localStorage
const STORAGE_KEY = 'galleryImages';
const DB_NAME = 'imageGalleryDB';
const DB_VERSION = 1;
const STORE_NAME = 'images';

// Define possible card sizes and their grid classes
const CARD_VARIANTS = [
  { size: 'small', class: 'col-span-1 row-span-1', aspectRatio: 1 },
  { size: 'wide', class: 'col-span-2 row-span-1', aspectRatio: 2 },
  { size: 'tall', class: 'col-span-1 row-span-2', aspectRatio: 0.5 },
  { size: 'large', class: 'col-span-2 row-span-2', aspectRatio: 1 },
  { size: 'portrait', class: 'col-span-1 row-span-2', aspectRatio: 0.7 },
  { size: 'landscape', class: 'col-span-2 row-span-1', aspectRatio: 1.6 },
  { size: 'square', class: 'col-span-1 row-span-1', aspectRatio: 1 },
  { size: 'panorama', class: 'col-span-3 row-span-1', aspectRatio: 2.5 },
  { size: 'vertical', class: 'col-span-1 row-span-3', aspectRatio: 0.4 },
  { size: 'featured', class: 'col-span-2 row-span-2', aspectRatio: 1.2 }
];

// Smart size selection based on image aspect ratio
const getSmartCardVariant = (width, height) => {
  const aspectRatio = width / height;
  
  if (aspectRatio > 2.2) return CARD_VARIANTS[7]; // panorama
  if (aspectRatio > 1.5) return CARD_VARIANTS[5]; // landscape
  if (aspectRatio < 0.5) return CARD_VARIANTS[8]; // vertical
  if (aspectRatio < 0.7) return CARD_VARIANTS[2]; // tall
  if (Math.random() > 0.7) return CARD_VARIANTS[3]; // occasional large
  return CARD_VARIANTS[0]; // default small
};

// Helper function to get random card variant
const getRandomCardVariant = () => {
  const weights = [
    { variant: CARD_VARIANTS[0], weight: 0.2 },  // small: 20%
    { variant: CARD_VARIANTS[1], weight: 0.15 }, // wide: 15%
    { variant: CARD_VARIANTS[2], weight: 0.15 }, // tall: 15%
    { variant: CARD_VARIANTS[3], weight: 0.1 },  // large: 10%
    { variant: CARD_VARIANTS[4], weight: 0.1 },  // portrait: 10%
    { variant: CARD_VARIANTS[5], weight: 0.15 }, // landscape: 15%
    { variant: CARD_VARIANTS[6], weight: 0.05 }, // square: 5%
    { variant: CARD_VARIANTS[7], weight: 0.05 }, // panorama: 5%
    { variant: CARD_VARIANTS[8], weight: 0.03 }, // vertical: 3%
    { variant: CARD_VARIANTS[9], weight: 0.02 }  // featured: 2%
  ];

  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const { variant, weight } of weights) {
    if (random <= weight) return variant;
    random -= weight;
  }
  
  return CARD_VARIANTS[0];
};

// IndexedDB utility functions
const initDB = () => {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject("Your browser doesn't support IndexedDB");
      return;
    }
    
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (event) => {
      console.error('IndexedDB error:', event);
      reject('Could not open IndexedDB');
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      resolve(db);
    };
  });
};

const saveImagesToIndexedDB = async (images) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Clear existing images
    store.clear();
    
    // Add all images
    for (const image of images) {
      store.put(image);
    }
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = (error) => reject(error);
    });
  } catch (error) {
    console.error('Error saving to IndexedDB:', error);
    return false;
  }
};

const loadImagesFromIndexedDB = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = (error) => reject(error);
    });
  } catch (error) {
    console.error('Error loading from IndexedDB:', error);
    return [];
  }
};

function App() {
  const [images, setImages] = useState([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Load images on component mount
  useEffect(() => {
    const loadImages = async () => {
      try {
        setIsLoading(true);
        // Try IndexedDB first
        let loadedImages = [];
        try {
          loadedImages = await loadImagesFromIndexedDB();
        } catch (indexedDBError) {
          console.warn('Failed to load from IndexedDB, falling back to localStorage', indexedDBError);
        }
        
        // Fall back to localStorage if IndexedDB is empty or fails
        if (!loadedImages || loadedImages.length === 0) {
          const savedImages = localStorage.getItem(STORAGE_KEY);
          if (savedImages) {
            loadedImages = JSON.parse(savedImages);
          }
        }
        
        if (loadedImages && loadedImages.length > 0) {
          const migratedImages = loadedImages.map(img => ({
            ...img,
            details: {
              ...img.details,
              variant: img.details.variant || getRandomCardVariant()
            }
          }));
          setImages(migratedImages);
        }
      } catch (error) {
        console.error('Error loading images:', error);
        setError('Failed to load saved images.');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadImages();
  }, []);

  // Save images when they change
  useEffect(() => {
    const saveImages = async () => {
      if (images.length === 0) return;
      
      let savedSuccessfully = false;
      
      // Try IndexedDB first
      try {
        const savedToIndexedDB = await saveImagesToIndexedDB(images);
        if (savedToIndexedDB) {
          savedSuccessfully = true;
        }
      } catch (indexedDBError) {
        console.warn('Failed to save to IndexedDB, will try localStorage', indexedDBError);
      }
      
      // Also try localStorage as backup or if IndexedDB failed
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
        savedSuccessfully = true;
      } catch (localStorageError) {
        console.warn('Could not save to localStorage:', localStorageError);
        
        if (!savedSuccessfully) {
          setError('Unable to save images. Storage limit may have been reached.');
        }
      }
    };
    
    saveImages();
  }, [images]);

  // Handle Navigation Scroll
  const controlNavbar = useCallback(() => {
    if (window.scrollY > lastScrollY && window.scrollY > 100) {
      setIsNavVisible(false);
    } else {
      setIsNavVisible(true);
    }
    setLastScrollY(window.scrollY);
  }, [lastScrollY]);

  useEffect(() => {
    window.addEventListener('scroll', controlNavbar);
    return () => window.removeEventListener('scroll', controlNavbar);
  }, [controlNavbar]);

  // Add ripple effect
  const createRipple = (event) => {
    const ripple = document.createElement('div');
    ripple.classList.add('ripple');
    ripple.style.left = `${event.clientX}px`;
    ripple.style.top = `${event.clientY}px`;
    document.body.appendChild(ripple);
    
    ripple.addEventListener('animationend', () => {
      ripple.remove();
    });
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Calculate aspect ratio string
  const calculateAspectRatio = (width, height) => {
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const divisor = gcd(width, height);
    return `${width/divisor}:${height/divisor}`;
  };

  const preloadImage = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const smartVariant = getSmartCardVariant(img.width, img.height);
        resolve({
          width: img.width,
          height: img.height,
          aspectRatio: img.width / img.height,
          timestamp: new Date().toISOString(),
          variant: smartVariant
        });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  };

  const handleAddImage = async (e) => {
    e.preventDefault();
    if (!newImageUrl.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const imageDetails = await preloadImage(newImageUrl);
      const newImage = {
        id: Date.now(),
        src: newImageUrl,
        alt: 'Gallery Image',
        details: imageDetails
      };
      
      setImages(prevImages => [newImage, ...prevImages]);
      setNewImageUrl('');
    } catch (error) {
      setError('Failed to load image. Please check the URL and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (id) => {
    setImages(prevImages => prevImages.filter(img => img.id !== id));
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatDimensions = (width, height) => {
    return `${width}×${height}`;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsLoading(true);
    setError(null);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const dataUrl = event.target.result;
        
        // Preload and add the image directly
        const imageDetails = await preloadImage(dataUrl);
        const newImage = {
          id: Date.now(),
          src: dataUrl,
          alt: file.name || 'Gallery Image',
          details: imageDetails
        };
        
        setImages(prevImages => [newImage, ...prevImages]);
      } catch (error) {
        console.error('Error processing uploaded file:', error);
        setError('Failed to process the uploaded image.');
      } finally {
        setIsLoading(false);
        // Reset the file input to allow selecting the same file again
        e.target.value = '';
      }
    };
    
    reader.onerror = () => {
      setError('Failed to read the file. Please try again.');
      setIsLoading(false);
      // Reset the file input on error
      e.target.value = '';
    };
    
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation */}
      <nav className={`nav-container ${!isNavVisible ? 'nav-hidden' : ''}`}>
        <motion.div 
          className="nav-content"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            e.currentTarget.style.setProperty('--x', `${x}px`);
            e.currentTarget.style.setProperty('--y', `${y}px`);
          }}
        >
          <motion.div 
            className="nav-logo"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            ImageGallery
          </motion.div>
          
          <div className="nav-search">
            <input
              type="text"
              placeholder="Search images..."
              className="w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <motion.div
              initial={{ scale: 1 }}
              whileTap={{ scale: 0.9 }}
            >
              <MagnifyingGlassIcon className="w-5 h-5" />
            </motion.div>
          </div>
          
          <div className="nav-actions">
            <motion.button 
              className="nav-button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => document.getElementById('file-input').click()}
            >
              <ArrowUpTrayIcon className="w-5 h-5" />
              Upload
            </motion.button>
            <motion.button 
              className="nav-button primary"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <PhotoIcon className="w-5 h-5" />
              Gallery
            </motion.button>
          </div>
        </motion.div>
      </nav>

      {/* File Input (hidden) */}
      <input
        type="file"
        id="file-input"
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
      />

      {/* Main Content */}
      <main className="pt-32 px-8">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* URL Upload Form */}
          <form onSubmit={handleAddImage} className="flex gap-4">
            <div className="input-wrapper flex-1 relative">
              <input
                type="url"
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                placeholder="Paste an image URL to add to your collection..."
                className="w-full px-6 py-3.5 bg-white/5 rounded-xl text-white placeholder-white/40 
                  border border-white/10 focus:border-white/20 focus:bg-white/10
                  focus:outline-none focus:ring-2 focus:ring-white/10 transition-all"
                disabled={isLoading}
                required
              />
              {error && (
                <motion.p 
                  className="absolute -bottom-6 left-0 text-red-400 text-sm"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {error}
                </motion.p>
              )}
            </div>
            <motion.button
              type="submit"
              className="px-6 py-3.5 bg-gradient-to-r from-purple-500/80 to-pink-500/80 rounded-xl
                hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed
                shadow-lg shadow-purple-500/20 hover:shadow-xl hover:shadow-purple-500/30 
                border border-white/10 backdrop-blur-sm transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={isLoading}
            >
              {isLoading ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <span className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Image
                </span>
              )}
            </motion.button>
          </form>

          {/* Gallery Grid */}
          <motion.div 
            className="masonry-grid"
            layout
          >
            <AnimatePresence>
              {images.map((image) => (
                <motion.div
                  key={image.id}
                  className={`image-card ${image.details.variant.class}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  layout
                  transition={{ 
                    duration: 0.4,
                    ease: [0.4, 0, 0.2, 1]
                  }}
                  onHoverStart={() => setHoveredId(image.id)}
                  onHoverEnd={() => setHoveredId(null)}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    e.currentTarget.style.setProperty('--x', `${e.clientX - rect.left}px`);
                    e.currentTarget.style.setProperty('--y', `${e.clientY - rect.top}px`);
                    setSelectedImage(image);
                  }}
                >
                  <motion.div className="absolute inset-0 overflow-hidden">
                    <motion.img
                      src={image.src}
                      alt={image.alt}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      layoutId={`image-${image.id}`}
                    />
                    
                    {/* Hover Overlay */}
                    <motion.div
                      className="hover-info absolute inset-0 opacity-0 group-hover:opacity-100"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: hoveredId === image.id ? 1 : 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="absolute bottom-0 left-0 right-0 p-6 space-y-3">
                        <div className="flex justify-between items-end">
                          <div className="space-y-2">
                            <motion.div 
                              className="flex items-center gap-3"
                              initial={{ y: 20, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              transition={{ delay: 0.1 }}
                            >
                              <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
                                {formatDimensions(image.details.width, image.details.height)}
                              </span>
                              <span className="text-sm text-white/70 tracking-wide">
                                {formatDate(image.details.timestamp)}
                              </span>
                            </motion.div>
                            <motion.span 
                              className="inline-block text-xs tracking-wide px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/50 to-pink-500/50 backdrop-blur-sm"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: 0.2 }}
                            >
                              {image.details.variant.size}
                            </motion.span>
                          </div>
                          
                          {/* Delete Button */}
                          <motion.button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(image.id);
                            }}
                            className="p-3 bg-red-500/80 rounded-full hover:bg-red-600 shadow-lg"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.3 }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>

      {/* Image Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 bg-black/80 backdrop-blur-lg z-50 flex items-center justify-center p-4 cursor-pointer"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#1a1a1a]/90 rounded-2xl overflow-hidden max-w-5xl w-full max-h-[90vh] shadow-2xl cursor-default"
            >
              <div className="grid grid-cols-2 h-full">
                {/* Image Preview */}
                <div className="relative aspect-square">
                  <motion.img
                    src={selectedImage.src}
                    alt={selectedImage.alt}
                    className="absolute inset-0 w-full h-full object-cover"
                    layoutId={`image-${selectedImage.id}`}
                  />
                </div>

                {/* Image Details */}
                <div className="p-8 space-y-6 overflow-y-auto">
                  <div className="flex justify-between items-start">
                    <h2 className="text-2xl font-semibold tracking-tight">Image Details</h2>
                    <motion.button
                      onClick={() => setSelectedImage(null)}
                      className="p-2 hover:bg-white/10 rounded-full"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </motion.button>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-6">
                    <DetailItem 
                      label="Dimensions" 
                      value={formatDimensions(selectedImage.details.width, selectedImage.details.height)} 
                      icon={
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      }
                    />
                    <DetailItem 
                      label="Aspect Ratio" 
                      value={calculateAspectRatio(selectedImage.details.width, selectedImage.details.height)}
                      icon={
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      }
                    />
                    <DetailItem 
                      label="Added On" 
                      value={formatDate(selectedImage.details.timestamp)}
                      icon={
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      }
                    />
                    <DetailItem 
                      label="Card Size" 
                      value={selectedImage.details.variant.size}
                      icon={
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                        </svg>
                      }
                    />
                  </div>

                  {/* URL Section */}
                  <div className="space-y-2">
                    <label className="text-label">Image URL</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={selectedImage.src}
                        readOnly
                        className="flex-1 px-4 py-2 bg-black/30 rounded-lg text-sm font-mono"
                      />
                      <motion.button
                        onClick={() => navigator.clipboard.writeText(selectedImage.src)}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        Copy
                      </motion.button>
                    </div>
                  </div>

                                   {/* Delete Button */}
                                   <motion.button
                    onClick={() => {
                      handleDelete(selectedImage.id);
                      setSelectedImage(null);
                    }}
                    className="w-full px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-xl mt-4 flex items-center justify-center gap-2"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete Image
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Detail Item Component
const DetailItem = ({ label, value, icon }) => (
  <div className="bg-white/5 rounded-xl p-4 space-y-1">
    <div className="flex items-center gap-2 text-white/50">
      {icon}
      <span className="text-label">{label}</span>
    </div>
    <p className="text-lg font-medium tracking-wide">{value}</p>
  </div>
);

export default App;