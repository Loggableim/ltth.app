#!/usr/bin/env python3
"""Generate PNG favicons from SVG using PIL/Pillow"""
import os
try:
    from PIL import Image, ImageDraw
    
    def create_favicon(size, filename):
        # Create image with green background
        img = Image.new('RGB', (size, size), '#12a116')
        draw = ImageDraw.Draw(img)
        
        # Draw white diamond shape
        center = size // 2
        radius = size // 3
        points = [
            (center, center - radius),
            (center + radius, center),
            (center, center + radius),
            (center - radius, center)
        ]
        draw.polygon(points, fill='white')
        
        # Save
        img.save(f'assets/{filename}')
        print(f'Created {filename}')
    
    # Generate all sizes
    os.chdir('/home/runner/work/ltth.app/ltth.app')
    create_favicon(16, 'favicon-16x16.png')
    create_favicon(32, 'favicon-32x32.png')
    create_favicon(180, 'apple-touch-icon.png')
    create_favicon(192, 'icon-192x192.png')
    create_favicon(512, 'icon-512x512.png')
    
    # Create OG image
    og = Image.new('RGB', (1200, 630), '#0e0f10')
    draw = ImageDraw.Draw(og)
    draw.ellipse([700, 115, 1100, 515], fill='#12a116')
    og.save('assets/og-image.png')
    print('Created og-image.png')
    
    print('All favicons generated successfully!')
    
except ImportError:
    print('PIL/Pillow not available, keeping placeholder files')
except Exception as e:
    print(f'Error generating favicons: {e}')
