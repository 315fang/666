#!/usr/bin/env python3
import os
from PIL import Image, ImageDraw

# Colors from app.json
NORMAL_COLOR = "#A8A29E"  # gray
ACTIVE_COLOR = "#CA8A04"  # yellow

def hex_to_rgb(hex_color):
    """Convert hex color to RGB tuple"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

NORMAL_RGB = hex_to_rgb(NORMAL_COLOR)
ACTIVE_RGB = hex_to_rgb(ACTIVE_COLOR)

SIZE = 48
STROKE_WIDTH = 3

def draw_home(draw, color, offset_x=0, offset_y=0):
    """Draw home icon"""
    # House base (rectangle)
    draw.rectangle([12+offset_x, 18+offset_y, 36+offset_x, 36+offset_y], outline=color, width=STROKE_WIDTH)
    # Roof (triangle)
    draw.polygon([10+offset_x, 18+offset_y, 24+offset_x, 6+offset_y, 38+offset_x, 18+offset_y], outline=color, width=STROKE_WIDTH)
    # Door
    draw.rectangle([22+offset_x, 24+offset_y, 26+offset_x, 36+offset_y], outline=color, width=STROKE_WIDTH)

def draw_category(draw, color, offset_x=0, offset_y=0):
    """Draw shopping bag icon (for category)"""
    # Bag body
    draw.rounded_rectangle([12+offset_x, 12+offset_y, 36+offset_x, 36+offset_y], radius=4, outline=color, width=STROKE_WIDTH)
    # Handles
    draw.arc([16+offset_x, 8+offset_y, 20+offset_x, 12+offset_y], start=180, end=360, fill=color, width=STROKE_WIDTH)
    draw.arc([28+offset_x, 8+offset_y, 32+offset_x, 12+offset_y], start=180, end=360, fill=color, width=STROKE_WIDTH)
    draw.line([18+offset_x, 10+offset_y, 30+offset_x, 10+offset_y], fill=color, width=STROKE_WIDTH)

def draw_cart(draw, color, offset_x=0, offset_y=0):
    """Draw shopping cart icon"""
    # Cart body
    draw.rounded_rectangle([10+offset_x, 16+offset_y, 38+offset_x, 30+offset_y], radius=3, outline=color, width=STROKE_WIDTH)
    # Wheels
    draw.ellipse([12+offset_x, 28+offset_y, 18+offset_x, 34+offset_y], outline=color, width=STROKE_WIDTH)
    draw.ellipse([30+offset_x, 28+offset_y, 36+offset_x, 34+offset_y], outline=color, width=STROKE_WIDTH)
    # Handle
    draw.arc([20+offset_x, 10+offset_y, 28+offset_x, 18+offset_y], start=0, end=180, fill=color, width=STROKE_WIDTH)

def draw_user(draw, color, offset_x=0, offset_y=0):
    """Draw user icon"""
    # Head (circle)
    draw.ellipse([18+offset_x, 12+offset_y, 30+offset_x, 24+offset_y], outline=color, width=STROKE_WIDTH)
    # Body
    draw.line([24+offset_x, 24+offset_y, 24+offset_x, 36+offset_y], fill=color, width=STROKE_WIDTH)
    # Arms
    draw.line([18+offset_x, 28+offset_y, 30+offset_x, 28+offset_y], fill=color, width=STROKE_WIDTH)
    # Legs
    draw.line([24+offset_x, 36+offset_y, 18+offset_x, 42+offset_y], fill=color, width=STROKE_WIDTH)
    draw.line([24+offset_x, 36+offset_y, 30+offset_x, 42+offset_y], fill=color, width=STROKE_WIDTH)

def create_icon(icon_name, color_rgb):
    """Create an icon image"""
    img = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)
    
    if icon_name == "home":
        draw_home(draw, color_rgb)
    elif icon_name == "category":
        draw_category(draw, color_rgb)
    elif icon_name == "cart":
        draw_cart(draw, color_rgb)
    elif icon_name == "user":
        draw_user(draw, color_rgb)
    
    return img

def main():
    """Create all icon files"""
    icons = ["home", "category", "cart", "user"]
    
    for icon_name in icons:
        print(f"Creating {icon_name}...")
        
        # Normal version
        normal_img = create_icon(icon_name, NORMAL_RGB)
        normal_img.save(f"{icon_name}.png", "PNG")
        print(f"  Saved {icon_name}.png")
        
        # Active version
        active_img = create_icon(icon_name, ACTIVE_RGB)
        active_img.save(f"{icon_name}_active.png", "PNG")
        print(f"  Saved {icon_name}_active.png")
    
    print("\nAll icons created successfully!")

if __name__ == "__main__":
    main()