#!/usr/bin/env python3
"""
Mascot Sprite Sheet Generator for ltth.app
Combines multiple mascot poses into a single horizontal sprite sheet.

Requirements:
    pip install Pillow

Usage:
    python3 generate_sprite_sheet.py

Output:
    assets/mascot-sprite.png (1200x200px)
"""

from PIL import Image
import os

# Configuration
SPRITE_WIDTH = 200
SPRITE_HEIGHT = 200
NUM_SPRITES = 6
OUTPUT_PATH = "assets/mascot-sprite.png"

# Source images (mascot poses)
# Add or modify these paths based on available mascot images
SPRITE_SOURCES = [
    "assets/ltthicon.png",      # Default - neutral pose
    "assets/winken.png",        # Waving - greeting pose
    "assets/zwinkern.png",      # Winking - playful pose  
    "assets/ltthicon.png",      # Happy - placeholder (duplicate for now)
    "assets/winken.png",        # Excited - placeholder (duplicate for now)
    "assets/ltthicon.png",      # Thinking - placeholder (duplicate for now)
]

def resize_to_sprite(image_path, target_size=(SPRITE_WIDTH, SPRITE_HEIGHT)):
    """
    Load and resize an image to sprite dimensions while maintaining transparency.
    
    Args:
        image_path: Path to the source image
        target_size: Tuple of (width, height) for the sprite
        
    Returns:
        PIL Image object resized to target_size
    """
    try:
        img = Image.open(image_path)
        
        # Convert to RGBA if not already (preserve transparency)
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Resize using high-quality Lanczos resampling
        img_resized = img.resize(target_size, Image.Resampling.LANCZOS)
        
        return img_resized
    except FileNotFoundError:
        print(f"⚠️  Warning: {image_path} not found. Creating blank sprite.")
        # Create a blank transparent sprite as fallback
        return Image.new('RGBA', target_size, (0, 0, 0, 0))
    except Exception as e:
        print(f"❌ Error processing {image_path}: {e}")
        return Image.new('RGBA', target_size, (0, 0, 0, 0))

def create_sprite_sheet(source_images, output_path):
    """
    Create a horizontal sprite sheet from multiple images.
    
    Args:
        source_images: List of paths to source images
        output_path: Path where the sprite sheet will be saved
        
    Returns:
        bool: True if successful, False otherwise
    """
    # Calculate sprite sheet dimensions
    sheet_width = SPRITE_WIDTH * len(source_images)
    sheet_height = SPRITE_HEIGHT
    
    print(f"📐 Creating sprite sheet: {sheet_width}x{sheet_height}px")
    
    # Create blank sprite sheet with transparency
    sprite_sheet = Image.new('RGBA', (sheet_width, sheet_height), (0, 0, 0, 0))
    
    # Process each source image and paste into sprite sheet
    for i, source_path in enumerate(source_images):
        print(f"   Processing sprite {i+1}/{len(source_images)}: {source_path}")
        
        # Load and resize image
        sprite = resize_to_sprite(source_path)
        
        # Calculate position in sprite sheet
        x_position = i * SPRITE_WIDTH
        
        # Paste sprite into sheet at correct position
        sprite_sheet.paste(sprite, (x_position, 0), sprite)
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Save sprite sheet
    try:
        sprite_sheet.save(output_path, 'PNG', optimize=True)
        print(f"✅ Sprite sheet saved: {output_path}")
        print(f"   Size: {os.path.getsize(output_path) / 1024:.1f} KB")
        return True
    except Exception as e:
        print(f"❌ Error saving sprite sheet: {e}")
        return False

def validate_sprite_sheet(sprite_sheet_path):
    """
    Validate that the sprite sheet was created correctly.
    
    Args:
        sprite_sheet_path: Path to the sprite sheet
        
    Returns:
        bool: True if valid, False otherwise
    """
    try:
        img = Image.open(sprite_sheet_path)
        expected_width = SPRITE_WIDTH * NUM_SPRITES
        expected_height = SPRITE_HEIGHT
        
        if img.size != (expected_width, expected_height):
            print(f"⚠️  Warning: Sprite sheet size is {img.size}, expected ({expected_width}, {expected_height})")
            return False
        
        if img.mode != 'RGBA':
            print(f"⚠️  Warning: Sprite sheet is {img.mode}, expected RGBA")
            return False
        
        print(f"✅ Sprite sheet validation passed")
        return True
    except Exception as e:
        print(f"❌ Validation error: {e}")
        return False

def generate_css_reference():
    """
    Generate CSS code reference for using the sprite sheet.
    """
    print("\n" + "="*60)
    print("CSS Reference for Sprite Sheet")
    print("="*60)
    
    css_template = """
/* Base sprite class */
.mascot-sprite {{
    width: {width}px;
    height: {height}px;
    background-image: url('/assets/mascot-sprite.png');
    background-repeat: no-repeat;
    background-size: {total_width}px {height}px;
    display: inline-block;
}}
""".format(width=SPRITE_WIDTH, height=SPRITE_HEIGHT, total_width=SPRITE_WIDTH*NUM_SPRITES)
    
    print(css_template)
    
    pose_names = ['default', 'waving', 'winking', 'happy', 'excited', 'thinking']
    for i, pose in enumerate(pose_names):
        x_pos = -(i * SPRITE_WIDTH)
        print(f".mascot-{pose} {{ background-position: {x_pos}px 0; }}")
    
    print("\n" + "="*60)

def main():
    """
    Main function to generate the mascot sprite sheet.
    """
    print("🎨 Mascot Sprite Sheet Generator for ltth.app")
    print("="*60)
    
    # Check if source images exist
    missing_images = [img for img in SPRITE_SOURCES if not os.path.exists(img)]
    if missing_images:
        print(f"⚠️  Warning: {len(missing_images)} source images not found")
        print("   Will use placeholders for missing sprites")
    
    # Create sprite sheet
    success = create_sprite_sheet(SPRITE_SOURCES, OUTPUT_PATH)
    
    if success:
        # Validate sprite sheet
        validate_sprite_sheet(OUTPUT_PATH)
        
        # Generate CSS reference
        generate_css_reference()
        
        print("\n✨ Sprite sheet generation complete!")
        print(f"   Use in HTML: <div class=\"mascot-sprite mascot-waving\"></div>")
    else:
        print("\n❌ Sprite sheet generation failed")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
