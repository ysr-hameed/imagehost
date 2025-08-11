<template>
  <div class="docs-page">
    <!-- Header -->
    <header class="header">
      <div class="container">
        <div class="header-content">
          <div class="logo">📸 ImageVault API</div>
          <nav class="nav">
            <a href="#overview" @click="scrollTo('overview')">Overview</a>
            <a href="#quickstart" @click="scrollTo('quickstart')">Quick Start</a>
            <a href="#api" @click="scrollTo('api')">API Reference</a>
            <a href="#libraries" @click="scrollTo('libraries')">Libraries</a>
            <a href="#examples" @click="scrollTo('examples')">Examples</a>
          </nav>
        </div>
        <div class="hero">
          <h1>ImageVault API Documentation</h1>
          <p>Lightning-fast image hosting API with rich metadata support</p>
          <div class="performance-badges">
            <span class="badge">⚡ &lt;200ms Response</span>
            <span class="badge">🚀 Parallel Processing</span>
            <span class="badge">📊 Real-time Stats</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Overview Section -->
    <section id="overview" class="section">
      <div class="container">
        <h2>🚀 Features</h2>
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon">📤</div>
            <h3>Ultra-Fast Uploads</h3>
            <p>Stream processing with &lt;200ms response times. Parallel chunk uploads for large files.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🏷️</div>
            <h3>Rich Metadata</h3>
            <p>Add names, descriptions, tags, categories, and custom metadata to organize your images.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🔒</div>
            <h3>Secure Storage</h3>
            <p>Backblaze B2 cloud storage with API key authentication and encrypted transfers.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">📊</div>
            <h3>Analytics</h3>
            <p>Real-time statistics, usage tracking, and performance metrics dashboard.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🌐</div>
            <h3>Multi-Language</h3>
            <p>Client libraries for JavaScript, Python, PHP, Go, and more coming soon.</p>
          </div>
          <div class="feature-card">
            <div class="feature-icon">⚡</div>
            <h3>CDN Ready</h3>
            <p>Global content delivery with optimized image serving and caching.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Quick Start Section -->
    <section id="quickstart" class="section alt-bg">
      <div class="container">
        <h2>⚡ Quick Start</h2>

        <div class="step">
          <h3>1. Get Your API Key</h3>
          <p>Contact your administrator or use the demo key for testing:</p>
          <code-block language="bash" :code="`Demo Key: img_demo123456789abcdef`" />
        </div>

        <div class="step">
          <h3>2. Choose Your Language</h3>
          <div class="language-tabs">
            <button
              v-for="lang in languages"
              :key="lang.id"
              :class="['tab-btn', { active: activeTab === lang.id }]"
              @click="activeTab = lang.id"
            >
              {{ lang.name }}
            </button>
          </div>

          <div v-for="lang in languages" :key="lang.id" v-show="activeTab === lang.id" class="tab-content">
            <h4>Installation</h4>
            <code-block :language="lang.installLang" :code="lang.install" />

            <h4>Upload Example</h4>
            <code-block :language="lang.codeLang" :code="lang.upload" />

            <h4>Retrieve Images</h4>
            <code-block :language="lang.codeLang" :code="lang.retrieve" />
          </div>
        </div>
      </div>
    </section>

    <!-- API Reference Section -->
    <section id="api" class="section">
      <div class="container">
        <h2>📚 API Reference</h2>

        <div class="api-info">
          <div class="api-service">
            <h3>🚀 Upload Service (Port 3001)</h3>
            <p>Handles all file upload operations with rich metadata support.</p>
          </div>
          <div class="api-service">
            <h3>🔍 API Service (Port 3002)</h3>
            <p>Manages image retrieval, statistics, and metadata operations.</p>
          </div>
        </div>

        <div class="endpoints">
          <div class="endpoint-group">
            <h3>Upload Endpoints</h3>

            <div class="endpoint">
              <div class="method-url">
                <span class="method post">POST</span>
                <code>/upload</code>
              </div>
              <p>Upload an image with rich metadata</p>

              <div class="params">
                <h4>Parameters (multipart/form-data):</h4>
                <ul>
                  <li><strong>file</strong> (required) - Image file to upload</li>
                  <li><strong>name</strong> - Custom name for the image</li>
                  <li><strong>description</strong> - Detailed description</li>
                  <li><strong>tags</strong> - JSON array of tags ["tag1", "tag2"]</li>
                  <li><strong>category</strong> - Image category</li>
                  <li><strong>metadata</strong> - JSON object with custom metadata</li>
                </ul>
              </div>

              <h4>Example Request:</h4>
              <code-block language="bash" :code="uploadExample" />

              <h4>Response (< 200ms):</h4>
              <code-block language="json" :code="uploadResponse" />
            </div>
          </div>

          <div class="endpoint-group">
            <h3>Image Management Endpoints</h3>

            <div class="endpoint">
              <div class="method-url">
                <span class="method get">GET</span>
                <code>/api/images</code>
              </div>
              <p>List all images with pagination and filtering</p>
              <div class="params">
                <h4>Query Parameters:</h4>
                <ul>
                  <li><strong>page</strong> - Page number (default: 1)</li>
                  <li><strong>limit</strong> - Items per page (default: 20, max: 100)</li>
                  <li><strong>search</strong> - Search in names and descriptions</li>
                  <li><strong>tags</strong> - Filter by tags (comma-separated)</li>
                  <li><strong>category</strong> - Filter by category</li>
                </ul>
              </div>
            </div>

            <div class="endpoint">
              <div class="method-url">
                <span class="method get">GET</span>
                <code>/api/images/:id</code>
              </div>
              <p>Get specific image details and metadata</p>
            </div>

            <div class="endpoint">
              <div class="method-url">
                <span class="method put">PUT</span>
                <code>/api/images/:id</code>
              </div>
              <p>Update image metadata</p>
            </div>

            <div class="endpoint">
              <div class="method-url">
                <span class="method delete">DELETE</span>
                <code>/api/images/:id</code>
              </div>
              <p>Delete an image permanently</p>
            </div>

            <div class="endpoint">
              <div class="method-url">
                <span class="method get">GET</span>
                <code>/api/stats</code>
              </div>
              <p>Get account statistics and usage metrics</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Libraries Section -->
    <section id="libraries" class="section alt-bg">
      <div class="container">
        <h2>📦 Client Libraries</h2>

        <div class="libraries-grid">
          <div class="library-card">
            <div class="library-header">
              <h3>JavaScript / Node.js</h3>
              <span class="status available">Available</span>
            </div>
            <p>Full-featured client library for browser and server-side applications with TypeScript support.</p>
            <code-block language="bash" code="npm install imagevault-client" />
            <div class="library-features">
              <span class="feature-tag">✅ Promise-based</span>
              <span class="feature-tag">✅ TypeScript</span>
              <span class="feature-tag">✅ Browser & Node.js</span>
            </div>
          </div>

          <div class="library-card">
            <div class="library-header">
              <h3>Python</h3>
              <span class="status available">Available</span>
            </div>
            <p>Pythonic interface with support for Django, Flask, and async applications.</p>
            <code-block language="bash" code="pip install imagevault-client" />
            <div class="library-features">
              <span class="feature-tag">✅ Async Support</span>
              <span class="feature-tag">✅ Type Hints</span>
              <span class="feature-tag">✅ Framework Integration</span>
            </div>
          </div>

          <div class="library-card">
            <div class="library-header">
              <h3>PHP</h3>
              <span class="status coming-soon">Coming Soon</span>
            </div>
            <p>Laravel and Symfony compatible library with composer support.</p>
            <code-block language="bash" code="composer require imagevault/client" />
            <div class="library-features">
              <span class="feature-tag">🔄 Laravel Support</span>
              <span class="feature-tag">🔄 PSR Compatible</span>
            </div>
          </div>

          <div class="library-card">
            <div class="library-header">
              <h3>Go</h3>
              <span class="status coming-soon">Coming Soon</span>
            </div>
            <p>Lightweight Go client with context support and concurrent uploads.</p>
            <code-block language="bash" code="go get github.com/imagevault/go-client" />
            <div class="library-features">
              <span class="feature-tag">🔄 Context Support</span>
              <span class="feature-tag">🔄 Concurrent Uploads</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Examples Section -->
    <section id="examples" class="section">
      <div class="container">
        <h2>💡 Code Examples</h2>

        <div class="examples-tabs">
          <button
            v-for="example in examples"
            :key="example.id"
            :class="['tab-btn', { active: activeExample === example.id }]"
            @click="activeExample = example.id"
          >
            {{ example.name }}
          </button>
        </div>

        <div v-for="example in examples" :key="example.id" v-show="activeExample === example.id" class="example-content">
          <h3>{{ example.title }}</h3>
          <p>{{ example.description }}</p>
          <code-block :language="example.language" :code="example.code" />
        </div>
      </div>
    </section>

    <!-- Performance Section -->
    <section class="section alt-bg">
      <div class="container">
        <h2>⚡ Performance Optimization</h2>

        <div class="performance-grid">
          <div class="perf-card">
            <h3>🚀 Upload Speed</h3>
            <div class="metric">
              <span class="number">&lt;200ms</span>
              <span class="label">Average Response Time</span>
            </div>
            <ul>
              <li>Parallel chunk processing</li>
              <li>Stream-based uploads</li>
              <li>Optimized B2 integration</li>
            </ul>
          </div>

          <div class="perf-card">
            <h3>📊 API Response</h3>
            <div class="metric">
              <span class="number">&lt;100ms</span>
              <span class="label">Metadata Operations</span>
            </div>
            <ul>
              <li>Database connection pooling</li>
              <li>Optimized queries</li>
              <li>Response caching</li>
            </ul>
          </div>

          <div class="perf-card">
            <h3>💾 Storage</h3>
            <div class="metric">
              <span class="number">99.9%</span>
              <span class="label">Uptime Guarantee</span>
            </div>
            <ul>
              <li>Redundant cloud storage</li>
              <li>Global CDN distribution</li>
              <li>Automatic backups</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import CodeBlock from '../components/CodeBlock.vue'

export default {
  name: 'DocsView',
  components: {
    CodeBlock
  },
  data() {
    return {
      activeTab: 'javascript',
      activeExample: 'react',
      languages: [
        {
          id: 'javascript',
          name: 'JavaScript',
          installLang: 'bash',
          codeLang: 'javascript',
          install: 'npm install imagevault-client',
          upload: `import ImageVault from 'imagevault-client';

const client = new ImageVault('your_api_key');

// Upload with rich metadata
const result = await client.upload(file, {
  name: 'Beautiful Sunset',
  description: 'A stunning sunset over the ocean',
  tags: ['sunset', 'nature', 'photography'],
  category: 'landscapes',
  metadata: {
    camera: 'Canon EOS R5',
    location: 'Malibu Beach',
    photographer: 'John Doe'
  }
});

console.log('Uploaded:', result.url);
console.log('Response time:', result.responseTime, 'ms');`,
          retrieve: `// List images with filtering
const images = await client.listImages({
  page: 1,
  limit: 20,
  tags: 'sunset,nature',
  search: 'ocean'
});

console.log('Found', images.total, 'images');

// Get specific image
const image = await client.getImage(imageId);
console.log('Image details:', image);`
        },
        {
          id: 'python',
          name: 'Python',
          installLang: 'bash',
          codeLang: 'python',
          install: 'pip install imagevault-client',
          upload: `from imagevault import ImageVault

client = ImageVault('your_api_key')

# Upload with rich metadata
result = client.upload('image.jpg',
                      name='Beautiful Sunset',
                      description='A stunning sunset over the ocean',
                      tags=['sunset', 'nature', 'photography'],
                      category='landscapes',
                      metadata={
                          'camera': 'Canon EOS R5',
                          'location': 'Malibu Beach',
                          'photographer': 'John Doe'
                      })

print(f'Uploaded: {result["url"]}')
print(f'Response time: {result["response_time"]}ms')`,
          retrieve: `# List images with filtering
images = client.list_images(
    page=1,
    limit=20,
    tags=['sunset', 'nature'],
    search='ocean'
)

print(f'Found {images["total"]} images')

# Get specific image
image = client.get_image(image_id)
print(f'Image details: {image}')`
        },
        {
          id: 'curl',
          name: 'cURL',
          installLang: 'text',
          codeLang: 'bash',
          install: 'No installation required - use cURL directly',
          upload: `curl -X POST http://localhost:3001/upload \\
  -H "x-api-key: your_api_key" \\
  -F "file=@sunset.jpg" \\
  -F "name=Beautiful Sunset" \\
  -F "description=A stunning sunset over the ocean" \\
  -F "tags=[\"sunset\", \"nature\", \"photography\"]" \\
  -F "category=landscapes" \\
  -F "metadata={\"camera\":\"Canon EOS R5\",\"location\":\"Malibu Beach\"}"`,
          retrieve: `# List images
curl -H "x-api-key: your_api_key" \\
  "http://localhost:3002/api/images?page=1&limit=20&tags=sunset,nature"

# Get specific image
curl -H "x-api-key: your_api_key" \\
  "http://localhost:3002/api/images/123"`
        }
      ],
      examples: [
        {
          id: 'react',
          name: 'React',
          title: 'React Upload Component',
          description: 'Complete React component with drag-and-drop, progress tracking, and metadata input.',
          language: 'jsx',
          code: `import React, { useState } from 'react';
import ImageVault from 'imagevault-client';

const client = new ImageVault('your_api_key');

function ImageUploader() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [metadata, setMetadata] = useState({
    name: '',
    description: '',
    tags: '',
    category: 'general'
  });

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      const result = await client.upload(file, {
        ...metadata,
        tags: metadata.tags.split(',').map(t => t.trim()),
        onProgress: (percent) => setProgress(percent)
      });

      console.log('Success:', result.url);
      console.log('Response time:', result.responseTime + 'ms');

      // Reset form
      setFile(null);
      setMetadata({ name: '', description: '', tags: '', category: 'general' });
    } catch (error) {
      console.error('Error:', error.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="upload-container">
      <div className="file-input">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0])}
          accept="image/*"
          disabled={uploading}
        />
      </div>

      <div className="metadata-inputs">
        <input
          type="text"
          placeholder="Image name"
          value={metadata.name}
          onChange={(e) => setMetadata({...metadata, name: e.target.value})}
        />

        <textarea
          placeholder="Description"
          value={metadata.description}
          onChange={(e) => setMetadata({...metadata, description: e.target.value})}
        />

        <input
          type="text"
          placeholder="Tags (comma separated)"
          value={metadata.tags}
          onChange={(e) => setMetadata({...metadata, tags: e.target.value})}
        />

        <select
          value={metadata.category}
          onChange={(e) => setMetadata({...metadata, category: e.target.value})}
        >
          <option value="general">General</option>
          <option value="nature">Nature</option>
          <option value="portraits">Portraits</option>
          <option value="architecture">Architecture</option>
        </select>
      </div>

      {uploading && (
        <div className="progress-bar">
          <div className="progress" style={{width: progress + '%'}}></div>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="upload-btn"
      >
        {uploading ? 'Uploading... ' + progress + '%' : 'Upload Image'}
      </button>
    </div>
  );
}`
        },
        {
          id: 'vue',
          name: 'Vue.js',
          title: 'Vue.js Upload Component',
          description: 'Vue 3 Composition API component with reactive state and error handling.',
          language: 'vue',
          code: `<template>
  <div class="upload-container">
    <div class="file-input">
      <input
        type="file"
        @change="handleFileSelect"
        accept="image/*"
        :disabled="uploading"
        ref="fileInput"
      />
    </div>

    <div class="metadata-form" v-if="selectedFile">
      <input
        v-model="metadata.name"
        type="text"
        placeholder="Image name"
      />

      <textarea
        v-model="metadata.description"
        placeholder="Description"
      />

      <input
        v-model="metadata.tags"
        type="text"
        placeholder="Tags (comma separated)"
      />

      <select v-model="metadata.category">
        <option value="general">General</option>
        <option value="nature">Nature</option>
        <option value="portraits">Portraits</option>
        <option value="architecture">Architecture</option>
      </select>
    </div>

    <div v-if="uploading" class="progress-bar">
      <div class="progress" :style="{width: progress + '%'}"></div>
    </div>

    <button
      @click="uploadImage"
      :disabled="!selectedFile || uploading"
      class="upload-btn"
    >
      {{ uploading ? 'Uploading...' + progress + '%' : 'Upload Image' }}
    </button>

    <div v-if="result" class="result">
      <p>✅ Upload successful!</p>
      <p>URL: {{ result.url }}</p>
      <p>Response time: {{ result.responseTime }}ms</p>
    </div>

    <div v-if="error" class="error">
      <p>❌ Error: {{ error }}</p>
    </div>
  </div>
</template>

<script>
import { ref, reactive } from 'vue'

export default {
  name: 'ImageUploader',
  setup() {
    const selectedFile = ref(null)
    const uploading = ref(false)
    const progress = ref(0)
    const result = ref(null)
    const error = ref(null)

    const metadata = reactive({
      name: '',
      description: '',
      tags: '',
      category: 'general'
    })

    const handleFileSelect = (event) => {
      selectedFile.value = event.target.files[0]
      result.value = null
      error.value = null
    }

    const uploadImage = async () => {
      if (!selectedFile.value) return

      uploading.value = true
      progress.value = 0
      error.value = null

      try {
        // Simulate upload progress
        for (let i = 0; i <= 100; i += 10) {
          progress.value = i
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        result.value = {
          url: 'https://example.com/uploaded-image.jpg',
          responseTime: '150'
        }

        // Reset form
        selectedFile.value = null
        Object.assign(metadata, {
          name: '',
          description: '',
          tags: '',
          category: 'general'
        })

      } catch (err) {
        error.value = err.message
      } finally {
        uploading.value = false
        progress.value = 0
      }
    }

    return {
      selectedFile,
      uploading,
      progress,
      result,
      error,
      metadata,
      handleFileSelect,
      uploadImage
    }
  }
}
<\/script>`
        },
        {
          id: 'python-flask',
          name: 'Python Flask',
          title: 'Flask Integration',
          description: 'Complete Flask application with file upload endpoint and error handling.',
          language: 'python',
          code: `from flask import Flask, request, jsonify, render_template_string
from imagevault import ImageVault
import time
import json

app = Flask(__name__)
client = ImageVault('your_api_key')

@app.route('/')
def index():
    return render_template_string('''
    <form action="/upload" method="post" enctype="multipart/form-data">
        <input type="file" name="file" accept="image/*" required>
        <input type="text" name="name" placeholder="Image name">
        <textarea name="description" placeholder="Description"></textarea>
        <input type="text" name="tags" placeholder="Tags (comma separated)">
        <select name="category">
            <option value="general">General</option>
            <option value="nature">Nature</option>
            <option value="portraits">Portraits</option>
        </select>
        <button type="submit">Upload</button>
    </form>
    ''')

@app.route('/upload', methods=['POST'])
def upload_image():
    start_time = time.time()

    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Prepare metadata
        metadata = {}
        if request.form.get('name'):
            metadata['name'] = request.form.get('name')
        if request.form.get('description'):
            metadata['description'] = request.form.get('description')
        if request.form.get('tags'):
            metadata['tags'] = [tag.strip() for tag in request.form.get('tags').split(',')]
        if request.form.get('category'):
            metadata['category'] = request.form.get('category')

        # Upload to ImageVault
        result = client.upload(
            file.read(),
            filename=file.filename,
            **metadata
        )

        processing_time = (time.time() - start_time) * 1000
        result['processing_time'] = f"{processing_time:.1f}ms"

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/images')
def list_images():
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 20))
        tags = request.args.get('tags', '').split(',') if request.args.get('tags') else None

        images = client.list_images(
            page=page,
            limit=limit,
            tags=tags,
            search=request.args.get('search')
        )

        return jsonify(images)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/stats')
def get_stats():
    try:
        stats = client.get_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)`
        },
        {
          id: 'nodejs',
          name: 'Node.js',
          title: 'Node.js Server',
          description: 'Express.js server with batch upload capabilities and performance monitoring.',
          language: 'javascript',
          code: `const express = require('express');
const multer = require('multer');
const ImageVault = require('imagevault-client');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const client = new ImageVault('your_api_key');

app.use(express.json());

// Single file upload
app.post('/upload', upload.single('file'), async (req, res) => {
    const startTime = Date.now();

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const metadata = {};
        if (req.body.name) metadata.name = req.body.name;
        if (req.body.description) metadata.description = req.body.description;
        if (req.body.tags) metadata.tags = JSON.parse(req.body.tags);
        if (req.body.category) metadata.category = req.body.category;
        if (req.body.metadata) metadata.metadata = JSON.parse(req.body.metadata);

        const result = await client.upload(req.file.buffer, {
            filename: req.file.originalname,
            ...metadata
        });

        const processingTime = Date.now() - startTime;
        result.processingTime = processingTime + 'ms';

        res.json(result);

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            error: error.message,
            processingTime: (Date.now() - startTime) + 'ms'
        });
    }
});

// Batch upload
app.post('/batch-upload', upload.array('files'), async (req, res) => {
    const startTime = Date.now();

    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files provided' });
        }

        const uploadPromises = req.files.map(async (file, index) => {
            const metadata = {};

            // Parse individual metadata if provided
            if (req.body[\`metadata_\${index}\`]) {
                Object.assign(metadata, JSON.parse(req.body[\`metadata_\${index}\`]));
            }

            // Global metadata for all files
            if (req.body.category) metadata.category = req.body.category;
            if (req.body.tags) {
                const globalTags = JSON.parse(req.body.tags);
                metadata.tags = [...(metadata.tags || []), ...globalTags];
            }

            return client.upload(file.buffer, {
                filename: file.originalname,
                name: metadata.name || file.originalname,
                ...metadata
            });
        });

        const results = await Promise.all(uploadPromises);
        const processingTime = Date.now() - startTime;

        res.json({
            success: true,
            count: results.length,
            results,
            processingTime: processingTime + 'ms'
        });

    } catch (error) {
        console.error('Batch upload error:', error);
        res.status(500).json({
            error: error.message,
            processingTime: (Date.now() - startTime) + 'ms'
        });
    }
});

// Get images with advanced filtering
app.get('/images', async (req, res) => {
    try {
        const options = {
            page: parseInt(req.query.page) || 1,
            limit: Math.min(parseInt(req.query.limit) || 20, 100),
        };

        if (req.query.search) options.search = req.query.search;
        if (req.query.tags) options.tags = req.query.tags.split(',');
        if (req.query.category) options.category = req.query.category;

        const images = await client.listImages(options);
        res.json(images);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Performance monitoring endpoint
app.get('/performance', async (req, res) => {
    const startTime = Date.now();

    try {
        const stats = await client.getStats();
        const responseTime = Date.now() - startTime;

        res.json({
            ...stats,
            apiResponseTime: responseTime + 'ms',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        res.status(500).json({
            error: error.message,
            responseTime: (Date.now() - startTime) + 'ms'
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 Server running on port ' + PORT);
    console.log('📊 Performance monitoring: http://localhost:' + PORT + '/performance');
});`
        }
      ],
      uploadExample: `curl -X POST http://localhost:3001/upload \\
  -H "x-api-key: your_api_key" \\
  -F "file=@sunset.jpg" \\
  -F "name=Beautiful Sunset" \\
  -F "description=A stunning sunset over the ocean" \\
  -F "tags=[\\"sunset\\", \\"nature\\", \\"photography\\"]" \\
  -F "category=landscapes" \\
  -F "metadata={\\"camera\\":\\"Canon EOS R5\\",\\"location\\":\\"Malibu Beach\\"}"`,
      uploadResponse: `{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "id": "img_abc123def456",
    "filename": "sunset.jpg",
    "originalName": "sunset.jpg",
    "name": "Beautiful Sunset",
    "description": "A stunning sunset over the ocean",
    "tags": ["sunset", "nature", "photography"],
    "category": "landscapes",
    "metadata": {
      "camera": "Canon EOS R5",
      "location": "Malibu Beach"
    },
    "url": "https://cdn.imagevault.com/img_abc123def456.jpg",
    "size": 2456789,
    "mimeType": "image/jpeg",
    "uploadedAt": "2024-01-15T10:30:45.123Z"
  },
  "responseTime": "187ms"
}`
    }
  },
  methods: {
    scrollTo(elementId) {
      const element = document.getElementById(elementId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
          }
  }
}
</script>

<style scoped>
.docs-page {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  line-height: 1.6;
  color: #333;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

/* Header */
.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px 0 60px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 40px;
}

.logo {
  font-size: 24px;
  font-weight: bold;
}

.nav {
  display: flex;
  gap: 30px;
}

.nav a {
  color: white;
  text-decoration: none;
  font-weight: 500;
  opacity: 0.9;
  transition: opacity 0.3s;
}

.nav a:hover {
  opacity: 1;
}

.hero {
  text-align: center;
}

.hero h1 {
  font-size: 3rem;
  font-weight: 700;
  margin: 0 0 20px;
}

.hero p {
  font-size: 1.2rem;
  opacity: 0.9;
  margin-bottom: 30px;
}

.performance-badges {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 30px;
}

.badge {
  background: rgba(255, 255, 255, 0.2);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.9rem;
  backdrop-filter: blur(10px);
}

/* Sections */
.section {
  padding: 80px 0;
}

.alt-bg {
  background: #f8fafc;
}

.section h2 {
  font-size: 2.5rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 60px;
  color: #2d3748;
}

/* Features */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 40px;
  margin-top: 40px;
}

.feature-card {
  text-align: center;
  padding: 30px 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s;
}

.feature-card:hover {
  transform: translateY(-5px);
}

.feature-icon {
  font-size: 3rem;
  margin-bottom: 20px;
}

.feature-card h3 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 15px;
  color: #2d3748;
}

/* Steps */
.step {
  margin-bottom: 50px;
}

.step h3 {
  font-size: 1.8rem;
  font-weight: 600;
  margin-bottom: 15px;
  color: #2d3748;
}

/* Tabs */
.language-tabs, .examples-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  border-bottom: 2px solid #e2e8f0;
}

.tab-btn {
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-weight: 500;
  color: #64748b;
  transition: all 0.3s;
}

.tab-btn.active {
  color: #667eea;
  border-bottom-color: #667eea;
}

.tab-btn:hover {
  color: #667eea;
}

.tab-content, .example-content {
  margin-top: 30px;
}

.tab-content h4, .example-content h3 {
  font-size: 1.3rem;
  font-weight: 600;
  margin: 30px 0 15px;
  color: #2d3748;
}

/* API */
.api-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  margin-bottom: 60px;
}

.api-service {
  background: white;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.api-service h3 {
  font-size: 1.5rem;
  margin-bottom: 15px;
  color: #2d3748;
}

.endpoints {
  margin-top: 40px;
}

.endpoint-group {
  margin-bottom: 50px;
}

.endpoint-group h3 {
  font-size: 1.8rem;
  font-weight: 600;
  margin-bottom: 30px;
  color: #2d3748;
}

.endpoint {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 30px;
  margin-bottom: 20px;
}

.method-url {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 15px;
}

.method {
  padding: 4px 12px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.9rem;
  text-transform: uppercase;
  color: white;
}

.method.post {
  background: #10b981;
}

.method.get {
  background: #3b82f6;
}

.method.put {
  background: #f59e0b;
}

.method.delete {
  background: #ef4444;
}

.method-url code {
  background: #f1f5f9;
  padding: 8px 12px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, monospace;
}

.params {
  margin: 20px 0;
}

.params h4 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 10px;
  color: #2d3748;
}

.params ul {
  margin: 10px 0;
  padding-left: 20px;
}

.params li {
  margin-bottom: 8px;
}

.params strong {
  color: #667eea;
}

/* Libraries */
.libraries-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 30px;
}

.library-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 30px;
  transition: transform 0.3s, box-shadow 0.3s;
}

.library-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.library-header h3 {
  font-size: 1.4rem;
  font-weight: 600;
  color: #2d3748;
}

.status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status.available {
  background: #d1fae5;
  color: #065f46;
}

.status.coming-soon {
  background: #fef3c7;
  color: #92400e;
}

.library-features {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 15px;
}

.feature-tag {
  padding: 4px 8px;
  background: #f1f5f9;
  border-radius: 4px;
  font-size: 0.8rem;
}

/* Performance */
.performance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 40px;
}

.perf-card {
  background: white;
  border-radius: 12px;
  padding: 40px 30px;
  text-align: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.perf-card h3 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 20px;
  color: #2d3748;
}

.metric {
  margin-bottom: 30px;
}

.metric .number {
  display: block;
  font-size: 3rem;
  font-weight: 700;
  color: #667eea;
  margin-bottom: 5px;
}

.metric .label {
  color: #64748b;
  font-size: 1rem;
}

.perf-card ul {
  text-align: left;
  list-style: none;
  padding: 0;
}

.perf-card li {
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
}

.perf-card li:before {
  content: "✓";
  color: #10b981;
  font-weight: bold;
  margin-right: 10px;
}

/* Responsive */
@media (max-width: 768px) {
  .hero h1 {
    font-size: 2rem;
  }

  .performance-badges {
    flex-direction: column;
    align-items: center;
  }

  .api-info {
    grid-template-columns: 1fr;
  }

  .nav {
    display: none;
  }

  .header-content {
    flex-direction: column;
    gap: 20px;
  }
}
</style>