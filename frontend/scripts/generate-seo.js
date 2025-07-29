// scripts/generate-seo.js
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const BASE_URL = process.env.VITE_SITE_URL || 'https://servoro.com'

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset 
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 
                      http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

  <url>
    <loc>${BASE_URL}/</loc>
    <priority>1.00</priority>
    <changefreq>daily</changefreq>
  </url>

  <url>
    <loc>${BASE_URL}/dashboard</loc>
    <priority>0.90</priority>
    <changefreq>weekly</changefreq>
  </url>

  <url>
    <loc>${BASE_URL}/profile</loc>
    <priority>0.80</priority>
    <changefreq>monthly</changefreq>
  </url>

  <url>
    <loc>${BASE_URL}/settings</loc>
    <priority>0.70</priority>
    <changefreq>monthly</changefreq>
  </url>

  <url>
    <loc>${BASE_URL}/login</loc>
    <priority>0.60</priority>
    <changefreq>yearly</changefreq>
  </url>

</urlset>`

const robots = `User-agent: *
Allow: /
Sitemap: ${BASE_URL}/sitemap.xml
`

const publicDir = path.resolve('public')
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir)

fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap)
fs.writeFileSync(path.join(publicDir, 'robots.txt'), robots)

console.log('✅ Sitemap and robots.txt generated!')