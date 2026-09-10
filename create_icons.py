from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, filename):
    # Create a simple blue icon with "JP" text
    img = Image.new('RGB', (size, size), color='#2563eb')
    draw = ImageDraw.Draw(img)
    
    # Draw a white circle
    circle_bbox = (size * 0.1, size * 0.1, size * 0.9, size * 0.9)
    draw.ellipse(circle_bbox, fill='white')
    
    # Draw "JP" text
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size // 2)
    except:
        font = ImageFont.load_default()
    
    text = "JP"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    x = (size - text_width) // 2
    y = (size - text_height) // 2
    
    draw.text((x, y), text, fill='#2563eb', font=font)
    
    # Save the image
    img.save(filename)
    print(f"✅ Created {filename} ({size}x{size})")

# Create icons
os.makedirs('icons', exist_ok=True)
create_icon(16, 'icons/icon16.png')
create_icon(48, 'icons/icon48.png')
create_icon(128, 'icons/icon128.png')

print("✅ All icons created successfully!")
