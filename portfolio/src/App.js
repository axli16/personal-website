import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

export const PointCloudMorph = () => {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const pointsRef = useRef(null);
  const geometryRef = useRef(null);
  const [currentShape, setCurrentShape] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const modelDataRef = useRef([]);

  // GLTFLoader equivalent using fetch and manual parsing
  const loadGLB = async (url) => {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      
      // Parse GLB format
      const dataView = new DataView(arrayBuffer);
      
      // Check GLB magic number
      const magic = dataView.getUint32(0, true);
      if (magic !== 0x46546C67) { // "glTF"
        throw new Error('Not a valid GLB file');
      }
      
      // Get JSON chunk
      const jsonChunkLength = dataView.getUint32(12, true);
      const jsonChunkType = dataView.getUint32(16, true);
      
      if (jsonChunkType !== 0x4E4F534A) { // "JSON"
        throw new Error('Invalid GLB format');
      }
      
      const jsonData = new Uint8Array(arrayBuffer, 20, jsonChunkLength);
      const gltf = JSON.parse(new TextDecoder().decode(jsonData));
      
      // Get binary chunk
      const binaryChunkLength = dataView.getUint32(20 + jsonChunkLength, true);
      const binaryData = new Uint8Array(arrayBuffer, 28 + jsonChunkLength, binaryChunkLength);
      
      // Extract mesh data
      const positions = [];
      
      if (gltf.meshes && gltf.meshes.length > 0) {
        for (const mesh of gltf.meshes) {
          for (const primitive of mesh.primitives) {
            const posAccessor = gltf.accessors[primitive.attributes.POSITION];
            const posBufferView = gltf.bufferViews[posAccessor.bufferView];
            
            const componentType = posAccessor.componentType;
            const count = posAccessor.count;
            const byteOffset = (posBufferView.byteOffset || 0) + (posAccessor.byteOffset || 0);
            
            // Read position data
            const TypedArray = componentType === 5126 ? Float32Array : Float32Array;
            const posData = new TypedArray(
              binaryData.buffer,
              binaryData.byteOffset + byteOffset,
              count * 3
            );
            
            positions.push(...posData);
          }
        }
      }
      
      return new Float32Array(positions);
    } catch (err) {
      console.error('Error loading GLB:', err);
      throw err;
    }
  };

  // Sample points from mesh geometry
  const samplePointsFromGeometry = (positions, targetCount) => {
    const sourceCount = positions.length / 3;
    const sampledPositions = new Float32Array(targetCount * 3);
    const colors = new Float32Array(targetCount * 3);
    
    // Calculate bounds for centering
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < sourceCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const scale = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    
    // Sample points
    for (let i = 0; i < targetCount; i++) {
      const sourceIndex = Math.floor(Math.random() * sourceCount);
      const i3 = i * 3;
      const si3 = sourceIndex * 3;
      
      // Normalize and center
      sampledPositions[i3] = ((positions[si3] - centerX) / scale) * 2;
      sampledPositions[i3 + 1] = ((positions[si3 + 1] - centerY) / scale) * 2;
      sampledPositions[i3 + 2] = ((positions[si3 + 2] - centerZ) / scale) * 2;
      
      // Generate colors based on model index
      const hue = (i / targetCount) * 360;
      const rgb = hslToRgb(hue / 360, 0.8, 0.6);
      colors[i3] = rgb[0];
      colors[i3 + 1] = rgb[1];
      colors[i3 + 2] = rgb[2];
    }
    
    return { positions: sampledPositions, colors };
  };

  const hslToRgb = (h, s, l) => {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [r, g, b];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationId;
    let scene, camera, renderer, points, geometry;

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

        // Load GLB files - REPLACE THESE WITH YOUR FILE PATHS
        const glbUrls = [
          './assets/Dumbell.glb',
          './assets/computer.glb',
          './assets/Motorcycle.glb'
        ];

        const particleCount = 15000;

        // Load all models
        for (const url of glbUrls) {
          try {
            const positions = await loadGLB(url);
            const data = samplePointsFromGeometry(positions, particleCount);
            modelDataRef.current.push(data);
          } catch (err) {
            console.error(`Failed to load ${url}:`, err);
            // Fallback to a simple shape if model fails to load
            const fallbackData = generateFallbackShape(particleCount);
            modelDataRef.current.push(fallbackData);
          }
        }

        if (modelDataRef.current.length === 0) {
          throw new Error('No models loaded successfully');
        }

        // Create point cloud with first model
        geometry = new THREE.BufferGeometry();
        geometryRef.current = geometry;

        const firstModel = modelDataRef.current[0];
        geometry.setAttribute('position', new THREE.BufferAttribute(firstModel.positions.slice(), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(firstModel.colors, 3));
        geometry.setAttribute('targetPosition', new THREE.BufferAttribute(firstModel.positions.slice(), 3));
        geometry.setAttribute('originalPosition', new THREE.BufferAttribute(firstModel.positions.slice(), 3));

        const material = new THREE.PointsMaterial({
          size: 0.025,
          vertexColors: true,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending
        });

        points = new THREE.Points(geometry, material);
        pointsRef.current = points;
        scene.add(points);

        setLoading(false);

        // Animation variables
        let morphProgress = 0;
        let ripplePhase = 0;
        let rotationSpeed = 0.003;
        const morphDuration = 120;
        let frameCount = 0;
        const shapeChangeInterval = 300;
        let localCurrentShape = 0;

        // Animation loop
        const animate = () => {
          animationId = requestAnimationFrame(animate);

          const positions = geometry.attributes.position.array;
          const targetPositions = geometry.attributes.targetPosition.array;
          const originalPositions = geometry.attributes.originalPosition.array;

          // Rotation
          points.rotation.y += rotationSpeed;
          points.rotation.x += rotationSpeed * 0.3;

          frameCount++;

          // Trigger morph
          if (frameCount % shapeChangeInterval === 0 && modelDataRef.current.length > 0) {
            morphProgress = 0;
            localCurrentShape = (localCurrentShape + 1) % modelDataRef.current.length;
            setCurrentShape(localCurrentShape);
            
            const nextModel = modelDataRef.current[localCurrentShape];
            geometry.attributes.targetPosition.array.set(nextModel.positions);
            geometry.attributes.originalPosition.array.set(positions);
            
            // Update colors
            geometry.attributes.color.array.set(nextModel.colors);
            geometry.attributes.color.needsUpdate = true;
          }

          // Morphing animation
          if (morphProgress < 1) {
            morphProgress += 1 / morphDuration;
            const eased = morphProgress < 0.5
              ? 2 * morphProgress * morphProgress
              : 1 - Math.pow(-2 * morphProgress + 2, 2) / 2;

            for (let i = 0; i < positions.length; i += 3) {
              positions[i] = originalPositions[i] + (targetPositions[i] - originalPositions[i]) * eased;
              positions[i + 1] = originalPositions[i + 1] + (targetPositions[i + 1] - originalPositions[i + 1]) * eased;
              positions[i + 2] = originalPositions[i + 2] + (targetPositions[i + 2] - originalPositions[i + 2]) * eased;
            }
            geometry.attributes.position.needsUpdate = true;
          }

          // Ripple effect
          ripplePhase += 0.05;
          if (morphProgress > 0 && morphProgress < 1) {
            for (let i = 0; i < positions.length; i += 3) {
              const x = positions[i];
              const y = positions[i + 1];
              const z = positions[i + 2];
              const dist = Math.sqrt(x * x + y * y + z * z);
              const ripple = Math.sin(dist * 5 - ripplePhase * 3) * 0.05 * (1 - morphProgress);
              
              positions[i] += x * ripple;
              positions[i + 1] += y * ripple;
              positions[i + 2] += z * ripple;
            }
            geometry.attributes.position.needsUpdate = true;
          }

          renderer.render(scene, camera);
        };

        animate();

      } catch (err) {
        console.error('Initialization error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    // Fallback shape generator
    const generateFallbackShape = (count) => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const phi = Math.acos(-1 + (2 * i) / count);
        const theta = Math.sqrt(count * Math.PI) * phi;
        const radius = 1.5;
        
        positions[i3] = radius * Math.cos(theta) * Math.sin(phi);
        positions[i3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
        positions[i3 + 2] = radius * Math.cos(phi);
        
        colors[i3] = 0.5 + Math.random() * 0.5;
        colors[i3 + 1] = 0.5 + Math.random() * 0.5;
        colors[i3 + 2] = 0.5 + Math.random() * 0.5;
      }
      
      return { positions, colors };
    };

    init();

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
      if (geometry) geometry.dispose();
      if (points && points.material) points.material.dispose();
      if (renderer) renderer.dispose();
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
        className="w-full h-full"
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

