#!/bin/bash
# Build script for Community Highlighter macOS app
# Run this from the project root directory

set -e  # Exit on error

echo "=============================================="
echo "🏛️  Building Community Highlighter for macOS"
echo "=============================================="

# Configuration
APP_NAME="Community Highlighter"
VERSION="7.0.0"
DMG_NAME="CommunityHighlighter-${VERSION}-macOS"

# Check we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this script from the project root directory"
    exit 1
fi

# Step 1: Clean previous builds
echo ""
echo "🧹 Cleaning previous builds..."
rm -rf build dist/*.app dist/CommunityHighlighter "${DMG_NAME}.dmg" 2>/dev/null || true

# Step 2: Activate virtual environment
echo ""
echo "🐍 Activating virtual environment..."
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
fi

# Step 3: Install/update build tools
echo ""
echo "📦 Installing build tools..."
pip install pyinstaller --quiet

# Step 4: Build frontend
echo ""
echo "⚛️  Building React frontend..."
npm run build

# Step 5: Create app icon from logo (if iconutil available)
echo ""
echo "🎨 Preparing app icon..."
if [ -f "logo.png" ]; then
    # Create iconset directory
    mkdir -p AppIcon.iconset
    
    # Generate different sizes using sips (built into macOS)
    sips -z 16 16     logo.png --out AppIcon.iconset/icon_16x16.png 2>/dev/null || true
    sips -z 32 32     logo.png --out AppIcon.iconset/icon_16x16@2x.png 2>/dev/null || true
    sips -z 32 32     logo.png --out AppIcon.iconset/icon_32x32.png 2>/dev/null || true
    sips -z 64 64     logo.png --out AppIcon.iconset/icon_32x32@2x.png 2>/dev/null || true
    sips -z 128 128   logo.png --out AppIcon.iconset/icon_128x128.png 2>/dev/null || true
    sips -z 256 256   logo.png --out AppIcon.iconset/icon_128x128@2x.png 2>/dev/null || true
    sips -z 256 256   logo.png --out AppIcon.iconset/icon_256x256.png 2>/dev/null || true
    sips -z 512 512   logo.png --out AppIcon.iconset/icon_256x256@2x.png 2>/dev/null || true
    sips -z 512 512   logo.png --out AppIcon.iconset/icon_512x512.png 2>/dev/null || true
    sips -z 1024 1024 logo.png --out AppIcon.iconset/icon_512x512@2x.png 2>/dev/null || true
    
    # Convert to icns
    iconutil -c icns AppIcon.iconset -o AppIcon.icns 2>/dev/null || true
    rm -rf AppIcon.iconset
    
    if [ -f "AppIcon.icns" ]; then
        echo "✅ Created AppIcon.icns"
    fi
fi

# Step 6: Run PyInstaller
echo ""
echo "🔨 Building application bundle with PyInstaller..."
pyinstaller CommunityHighlighter.spec --clean --noconfirm

# Step 7: Copy icon if created
if [ -f "AppIcon.icns" ]; then
    cp AppIcon.icns "dist/Community Highlighter.app/Contents/Resources/icon-windowed.icns" 2>/dev/null || true
fi

# Step 8: Create DMG installer
echo ""
echo "📀 Creating DMG installer..."

if command -v create-dmg &> /dev/null; then
    create-dmg \
        --volname "${APP_NAME}" \
        --volicon "AppIcon.icns" \
        --window-pos 200 120 \
        --window-size 600 400 \
        --icon-size 100 \
        --icon "${APP_NAME}.app" 150 185 \
        --hide-extension "${APP_NAME}.app" \
        --app-drop-link 450 185 \
        --no-internet-enable \
        "${DMG_NAME}.dmg" \
        "dist/${APP_NAME}.app" \
    || {
        echo "⚠️  create-dmg failed, creating simple DMG..."
        hdiutil create -volname "${APP_NAME}" -srcfolder "dist/${APP_NAME}.app" -ov -format UDZO "${DMG_NAME}.dmg"
    }
else
    echo "⚠️  create-dmg not found, creating simple DMG..."
    hdiutil create -volname "${APP_NAME}" -srcfolder "dist/${APP_NAME}.app" -ov -format UDZO "${DMG_NAME}.dmg"
fi

# Step 9: Create ZIP archive as backup
echo ""
echo "📦 Creating ZIP archive..."
cd dist
zip -r "../${DMG_NAME}.zip" "${APP_NAME}.app"
cd ..

# Step 10: Calculate checksums
echo ""
echo "🔐 Calculating checksums..."
if [ -f "${DMG_NAME}.dmg" ]; then
    shasum -a 256 "${DMG_NAME}.dmg" > "${DMG_NAME}.dmg.sha256"
    echo "DMG SHA256: $(cat ${DMG_NAME}.dmg.sha256)"
fi
shasum -a 256 "${DMG_NAME}.zip" > "${DMG_NAME}.zip.sha256"
echo "ZIP SHA256: $(cat ${DMG_NAME}.zip.sha256)"

# Cleanup
rm -f AppIcon.icns 2>/dev/null || true

echo ""
echo "=============================================="
echo "✅ Build complete!"
echo "=============================================="
echo ""
echo "Output files:"
[ -f "${DMG_NAME}.dmg" ] && echo "  📀 ${DMG_NAME}.dmg (recommended for distribution)"
echo "  📦 ${DMG_NAME}.zip (backup)"
echo "  📁 dist/${APP_NAME}.app (raw app bundle)"
echo ""
echo "Next steps:"
echo "1. Test the app: open \"dist/${APP_NAME}.app\""
echo "2. Upload ${DMG_NAME}.dmg to GitHub Releases"
echo ""
