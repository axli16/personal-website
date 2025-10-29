import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

export const MorphingGLBScene = () => {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const meshRef = useRef(null);
  const [currentShape, setCurrentShape] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const modelDataRef = useRef([]);

  // GLTFLoader equivalent using fetch and manual parsing
  const loadGLB = async (url) => {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      
      const dataView = new DataView(arrayBuffer);
      
      // Check GLB magic number
      const magic = dataView.getUint32(0, true);
      if (magic !== 0x46546C67) {
        throw new Error('Not a valid GLB file');
      }
      
      // Get JSON chunk
      const jsonChunkLength = dataView.getUint32(12, true);
      const jsonChunkType = dataView.getUint32(16, true);
      
      if (jsonChunkType !== 0x4E4F534A) {
        throw new Error('Invalid GLB format');
      }
      
      const jsonData = new Uint8Array(arrayBuffer, 20, jsonChunkLength);
      const gltf = JSON.parse(new TextDecoder().decode(jsonData));
      
      // Get binary chunk
      const binaryChunkLength = dataView.getUint32(20 + jsonChunkLength, true);
      const binaryData = new Uint8Array(arrayBuffer, 28 + jsonChunkLength, binaryChunkLength);
      
      // Extract all mesh data
      const meshes = [];
      
      if (gltf.meshes && gltf.meshes.length > 0) {
        for (const mesh of gltf.meshes) {
          for (const primitive of mesh.primitives) {
            const posAccessor = gltf.accessors[primitive.attributes.POSITION];
            const posBufferView = gltf.bufferViews[posAccessor.bufferView];
            
            const count = posAccessor.count;
            const byteOffset = (posBufferView.byteOffset || 0) + (posAccessor.byteOffset || 0);
            
            const posData = new Float32Array(
              binaryData.buffer,
              binaryData.byteOffset + byteOffset,
              count * 3
            );
            
            // Get indices if they exist
            let indices = null;
            if (primitive.indices !== undefined) {
              const indAccessor = gltf.accessors[primitive.indices];
              const indBufferView = gltf.bufferViews[indAccessor.bufferView];
              const indByteOffset = (indBufferView.byteOffset || 0) + (indAccessor.byteOffset || 0);
              
              if (indAccessor.componentType === 5123) { // UNSIGNED_SHORT
                indices = new Uint16Array(
                  binaryData.buffer,
                  binaryData.byteOffset + indByteOffset,
                  indAccessor.count
                );
              } else if (indAccessor.componentType === 5125) { // UNSIGNED_INT
                indices = new Uint32Array(
                  binaryData.buffer,
                  binaryData.byteOffset + indByteOffset,
                  indAccessor.count
                );
              }
            }
            
            meshes.push({ positions: posData, indices });
          }
        }
      }
      
      return meshes;
    } catch (err) {
      console.error('Error loading GLB:', err);
      throw err;
    }
  };

  // Normalize and center geometry
  const normalizeGeometry = (positions) => {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]);
      maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]);
      maxY = Math.max(maxY, positions[i + 1]);
      minZ = Math.min(minZ, positions[i + 2]);
      maxZ = Math.max(maxZ, positions[i + 2]);
    }
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const scale = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    
    const normalized = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      normalized[i] = ((positions[i] - centerX) / scale) * 2;
      normalized[i + 1] = ((positions[i + 1] - centerY) / scale) * 2;
      normalized[i + 2] = ((positions[i + 2] - centerZ) / scale) * 2;
    }
    
    return normalized;
  };

  // Create a morphed geometry that interpolates vertex counts
  const createMorphGeometry = (fromPositions, toPositions, progress) => {
    const fromCount = fromPositions.length / 3;
    const toCount = toPositions.length / 3;
    
    // Determine current vertex count based on progress
    const currentCount = Math.round(fromCount + (toCount - fromCount) * progress);
    const positions = new Float32Array(currentCount * 3);
    
    for (let i = 0; i < currentCount; i++) {
      const t = i / (currentCount - 1);
      
      // Map to source vertex
      const fromIndex = Math.min(Math.floor(t * (fromCount - 1)), fromCount - 1);
      const fromIndex2 = Math.min(fromIndex + 1, fromCount - 1);
      const fromT = (t * (fromCount - 1)) - fromIndex;
      
      const fromI = fromIndex * 3;
      const fromI2 = fromIndex2 * 3;
      
      const fromX = fromPositions[fromI] * (1 - fromT) + fromPositions[fromI2] * fromT;
      const fromY = fromPositions[fromI + 1] * (1 - fromT) + fromPositions[fromI2 + 1] * fromT;
      const fromZ = fromPositions[fromI + 2] * (1 - fromT) + fromPositions[fromI2 + 2] * fromT;
      
      // Map to target vertex
      const toIndex = Math.min(Math.floor(t * (toCount - 1)), toCount - 1);
      const toIndex2 = Math.min(toIndex + 1, toCount - 1);
      const toT = (t * (toCount - 1)) - toIndex;
      
      const toI = toIndex * 3;
      const toI2 = toIndex2 * 3;
      
      const toX = toPositions[toI] * (1 - toT) + toPositions[toI2] * toT;
      const toY = toPositions[toI + 1] * (1 - toT) + toPositions[toI2 + 1] * toT;
      const toZ = toPositions[toI + 2] * (1 - toT) + toPositions[toI2 + 2] * toT;
      
      // Interpolate between from and to
      const i3 = i * 3;
      positions[i3] = fromX * (1 - progress) + toX * progress;
      positions[i3 + 1] = fromY * (1 - progress) + toY * progress;
      positions[i3 + 2] = fromZ * (1 - progress) + toZ * progress;
    }
    
    return positions;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationId;
    let scene, camera, renderer, mesh;

    const init = async () => {
      try {
        // Setup scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a0a);
        sceneRef.current = scene;

        // Setup camera
        camera = new THREE.PerspectiveCamera(
          75,
          canvas.clientWidth / canvas.clientHeight,
          0.1,
          1000
        );
        camera.position.z = 5;
        cameraRef.current = camera;

        // Setup renderer
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        rendererRef.current = renderer;

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);
        
        const directionalLight2 = new THREE.DirectionalLight(0x4444ff, 0.3);
        directionalLight2.position.set(-5, -5, -5);
        scene.add(directionalLight2);

        // Load GLB files - REPLACE THESE WITH YOUR FILE PATHS
        const glbUrls = [
          'assets/Pagoda.glb',
          'assets/computer.glb',
          'assets/Motorcycle.glb'
        ];

        // Load all models
        const loadedModels = [];
        for (const url of glbUrls) {
          try {
            const meshes = await loadGLB(url);
            // Combine all meshes from this model
            let allPositions = [];
            for (const meshData of meshes) {
              if (meshData.indices) {
                // Convert indexed geometry to non-indexed
                for (let i = 0; i < meshData.indices.length; i++) {
                  const idx = meshData.indices[i] * 3;
                  allPositions.push(
                    meshData.positions[idx],
                    meshData.positions[idx + 1],
                    meshData.positions[idx + 2]
                  );
                }
              } else {
                allPositions.push(...meshData.positions);
              }
            }
            
            const positions = new Float32Array(allPositions);
            const normalized = normalizeGeometry(positions);
            loadedModels.push({ positions: normalized });
          } catch (err) {
            console.error(`Failed to load ${url}:`, err);
            // Fallback to a simple shape
            const fallback = generateFallbackShape();
            loadedModels.push({ positions: fallback });
          }
        }

        if (loadedModels.length === 0) {
          throw new Error('No models loaded successfully');
        }

        modelDataRef.current = loadedModels;

        // Create mesh with first model
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(loadedModels[0].positions.slice(), 3));
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
          color: 0x4488ff,
          metalness: 0.7,
          roughness: 0.3,
          flatShading: false,
          side: THREE.DoubleSide
        });

        mesh = new THREE.Mesh(geometry, material);
        meshRef.current = mesh;
        scene.add(mesh);

        setLoading(false);

        // Animation variables
        let morphProgress = 0;
        let ripplePhase = 0;
        const morphDuration = 120;
        let frameCount = 0;
        const shapeChangeInterval = 300;
        let localCurrentShape = 0;
        let nextShape = 0;
        let isMorphing = false;

        // Mouse interaction variables
        let isDragging = false;
        let previousMouseX = 0;
        let previousMouseY = 0;
        let rotationVelocityX = 0;
        let rotationVelocityY = 0;
        const damping = 0.95;

        // Mouse event handlers
        const handleMouseDown = (e) => {
          isDragging = true;
          previousMouseX = e.clientX;
          previousMouseY = e.clientY;
          rotationVelocityX = 0;
          rotationVelocityY = 0;
        };

        const handleMouseMove = (e) => {
          if (!isDragging) return;
          
          const deltaX = e.clientX - previousMouseX;
          const deltaY = e.clientY - previousMouseY;
          
          rotationVelocityY = deltaX * 0.005;
          rotationVelocityX = deltaY * 0.005;
          
          mesh.rotation.y += rotationVelocityY;
          mesh.rotation.x += rotationVelocityX;
          
          previousMouseX = e.clientX;
          previousMouseY = e.clientY;
        };

        const handleMouseUp = () => {
          isDragging = false;
        };

        const handleTouchStart = (e) => {
          if (e.touches.length === 1) {
            isDragging = true;
            previousMouseX = e.touches[0].clientX;
            previousMouseY = e.touches[0].clientY;
            rotationVelocityX = 0;
            rotationVelocityY = 0;
          }
        };

        const handleTouchMove = (e) => {
          if (!isDragging || e.touches.length !== 1) return;
          e.preventDefault();
          
          const deltaX = e.touches[0].clientX - previousMouseX;
          const deltaY = e.touches[0].clientY - previousMouseY;
          
          rotationVelocityY = deltaX * 0.005;
          rotationVelocityX = deltaY * 0.005;
          
          mesh.rotation.y += rotationVelocityY;
          mesh.rotation.x += rotationVelocityX;
          
          previousMouseX = e.touches[0].clientX;
          previousMouseY = e.touches[0].clientY;
        };

        const handleTouchEnd = () => {
          isDragging = false;
        };

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseUp);
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd);

        // Animation loop
        const animate = () => {
          animationId = requestAnimationFrame(animate);

          // Apply inertia when not dragging
          if (!isDragging) {
            mesh.rotation.y += rotationVelocityY;
            mesh.rotation.x += rotationVelocityX;
            rotationVelocityX *= damping;
            rotationVelocityY *= damping;
          }

          frameCount++;

          // Trigger morph
          if (frameCount % shapeChangeInterval === 0 && modelDataRef.current.length > 1) {
            morphProgress = 0;
            isMorphing = true;
            nextShape = (localCurrentShape + 1) % modelDataRef.current.length;
            setCurrentShape(nextShape);
          }

          // Morphing animation with dynamic vertex count
          if (isMorphing && morphProgress < 1) {
            morphProgress += 1 / morphDuration;
            const eased = morphProgress < 0.5
              ? 2 * morphProgress * morphProgress
              : 1 - Math.pow(-2 * morphProgress + 2, 2) / 2;

            const fromModel = modelDataRef.current[localCurrentShape];
            const toModel = modelDataRef.current[nextShape];
            
            // Create morphed positions with interpolated vertex count
            const morphedPositions = createMorphGeometry(
              fromModel.positions,
              toModel.positions,
              eased
            );

            // Apply ripple effect
            ripplePhase += 0.05;
            const rippleMagnitude = Math.sin(morphProgress * Math.PI) * 0.05;
            
            for (let i = 0; i < morphedPositions.length; i += 3) {
              const x = morphedPositions[i];
              const y = morphedPositions[i + 1];
              const z = morphedPositions[i + 2];
              const dist = Math.sqrt(x * x + y * y + z * z);
              const ripple = Math.sin(dist * 5 - ripplePhase * 3) * rippleMagnitude;
              
              morphedPositions[i] = x * (1 + ripple);
              morphedPositions[i + 1] = y * (1 + ripple);
              morphedPositions[i + 2] = z * (1 + ripple);
            }

            // Update geometry
            const newGeometry = new THREE.BufferGeometry();
            newGeometry.setAttribute('position', new THREE.BufferAttribute(morphedPositions, 3));
            newGeometry.computeVertexNormals();
            
            // Replace geometry
            mesh.geometry.dispose();
            mesh.geometry = newGeometry;

            if (morphProgress >= 1) {
              isMorphing = false;
              localCurrentShape = nextShape;
            }
          }

          renderer.render(scene, camera);
        };

        animate();

        // Cleanup event listeners
        return () => {
          canvas.removeEventListener('mousedown', handleMouseDown);
          canvas.removeEventListener('mousemove', handleMouseMove);
          canvas.removeEventListener('mouseup', handleMouseUp);
          canvas.removeEventListener('mouseleave', handleMouseUp);
          canvas.removeEventListener('touchstart', handleTouchStart);
          canvas.removeEventListener('touchmove', handleTouchMove);
          canvas.removeEventListener('touchend', handleTouchEnd);
        };

      } catch (err) {
        console.error('Initialization error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    // Fallback shape generator
    const generateFallbackShape = () => {
      const positions = [];
      const segments = 32;
      
      for (let i = 0; i <= segments; i++) {
        for (let j = 0; j <= segments; j++) {
          const u = (i / segments) * Math.PI * 2;
          const v = (j / segments) * Math.PI;
          
          const x = Math.sin(v) * Math.cos(u) * 1.5;
          const y = Math.sin(v) * Math.sin(u) * 1.5;
          const z = Math.cos(v) * 1.5;
          
          positions.push(x, y, z);
        }
      }
      
      return new Float32Array(positions);
    };

    const cleanup = init();

    // Handle resize
    const handleResize = () => {
      if (!camera || !renderer) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationId) cancelAnimationFrame(animationId);
      if (mesh && mesh.geometry) mesh.geometry.dispose();
      if (mesh && mesh.material) mesh.material.dispose();
      if (renderer) renderer.dispose();
      cleanup?.then(fn => fn?.());
    };
  }, []);

  if (error) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center">
        <div className="text-red-500 text-center p-8">
          <h2 className="text-xl font-bold mb-4">Error Loading Models</h2>
          <p className="mb-4">{error}</p>
          <p className="text-sm text-gray-400">
            Please check that your GLB file paths are correct and accessible.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-black flex items-center justify-center overflow-hidden">
      {loading && (
        <div className="absolute z-10 text-white text-xl font-mono">
          Loading models...
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ display: 'block' }}
      />
      {!loading && (
        <div className="absolute bottom-8 left-8 text-white font-mono text-sm opacity-50">
          MODEL {currentShape + 1} / {modelDataRef.current.length}
        </div>
      )}
    </div>
  );
};
