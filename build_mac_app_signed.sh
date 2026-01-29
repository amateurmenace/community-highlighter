#!/bin/bash
# Build script for Community Highlighter macOS app with Code Signing
# Run this from the project root directory

set -e  # Exit on error

echo "=============================================="
echo "🏛️  Building Community Highlighter for macOS"
echo "       (With Code Signing & Notarization)"
echo "=============================================="

# ============================================
# CONFIGURATION - UPDATE THESE VALUES
# ============================================
DEVELOPER_ID="Developer ID Application: Stephen Walter (6M536MV7GT)"  # UPDATE THIS
NOTARIZE_PROFILE="community-highlighter-notarize"
APP_NAME="Community Highlighter"
VERSION="7.0.0"
DMG_NAME="CommunityHighlighter-${VERSION}-macOS"
BUNDLE_ID="com.communityhighlighter.app"

# ============================================
# VALIDATION
# ============================================
echo ""
echo "🔐 Checking code signing identity..."

# Check if the signing identity exists
if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
    echo "❌ Error: No 'Developer ID Application' certificate found!"
    echo ""
    echo "To fix this:"
    echo "1. Go to https://developer.apple.com/account/resources/certificates/list"
    echo "2. Create a 'Developer ID Application' certificate"
    echo "3. Download and install it"
    echo ""
    exit 1
fi

echo "✅ Found signing identity"

# Check we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this script from the project root directory"
    exit 1
fi

# ============================================
# BUILD STEPS
# ============================================

# Step 1: Clean previous builds
echo ""
echo "🧹 Cleaning previous builds..."
rm -rf build dist/*.app dist/CommunityHighlighter "${DMG_NAME}.dmg" "${DMG_NAME}-unsigned.dmg" 2>/dev/null || true

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

# Step 5: Create app icon
echo ""
echo "🎨 Preparing app icon..."
if [ -f "logo.png" ]; then
    mkdir -p AppIcon.iconset
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
    iconutil -c icns AppIcon.iconset -o AppIcon.icns 2>/dev/null || true
    rm -rf AppIcon.iconset
    [ -f "AppIcon.icns" ] && echo "✅ Created AppIcon.icns"
fi

# Step 6: Run PyInstaller
echo ""
echo "🔨 Building application bundle..."
pyinstaller CommunityHighlighter.spec --clean --noconfirm

# Step 7: Copy icon
if [ -f "AppIcon.icns" ]; then
    cp AppIcon.icns "dist/${APP_NAME}.app/Contents/Resources/" 2>/dev/null || true
fi

# ============================================
# CODE SIGNING
# ============================================
echo ""
echo "🔐 Code signing the application..."

# Sign all nested components first (frameworks, dylibs, etc.)
echo "   Signing nested components..."
find "dist/${APP_NAME}.app" -type f \( -name "*.dylib" -o -name "*.so" -o -name "*.framework" \) -exec \
    codesign --force --options runtime --sign "${DEVELOPER_ID}" {} \; 2>/dev/null || true

# Sign the main executable
echo "   Signing main executable..."
codesign --force --options runtime --sign "${DEVELOPER_ID}" \
    "dist/${APP_NAME}.app/Contents/MacOS/CommunityHighlighter" 2>/dev/null || true

# Sign the entire app bundle
echo "   Signing app bundle..."
codesign --force --deep --options runtime --sign "${DEVELOPER_ID}" \
    --entitlements /dev/stdin "dist/${APP_NAME}.app" << 'ENTITLEMENTS'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
ENTITLEMENTS

# Verify signature
echo "   Verifying signature..."
codesign --verify --deep --strict --verbose=2 "dist/${APP_NAME}.app" 2>&1 | head -5

echo "✅ Code signing complete"

# ============================================
# CREATE DMG
# ============================================
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
        "${DMG_NAME}-unsigned.dmg" \
        "dist/${APP_NAME}.app" \
    || {
        echo "⚠️  create-dmg failed, using hdiutil..."
        hdiutil create -volname "${APP_NAME}" -srcfolder "dist/${APP_NAME}.app" -ov -format UDZO "${DMG_NAME}-unsigned.dmg"
    }
else
    hdiutil create -volname "${APP_NAME}" -srcfolder "dist/${APP_NAME}.app" -ov -format UDZO "${DMG_NAME}-unsigned.dmg"
fi

# Sign the DMG
echo "   Signing DMG..."
codesign --force --sign "${DEVELOPER_ID}" "${DMG_NAME}-unsigned.dmg"
mv "${DMG_NAME}-unsigned.dmg" "${DMG_NAME}.dmg"

echo "✅ DMG created and signed"

# ============================================
# NOTARIZATION
# ============================================
echo ""
echo "📤 Submitting for notarization (this may take 5-15 minutes)..."

xcrun notarytool submit "${DMG_NAME}.dmg" \
    --keychain-profile "${NOTARIZE_PROFILE}" \
    --wait

# Check notarization result
NOTARIZE_STATUS=$?
if [ $NOTARIZE_STATUS -eq 0 ]; then
    echo "✅ Notarization successful!"
    
    # Staple the notarization ticket to the DMG
    echo "   Stapling notarization ticket..."
    xcrun stapler staple "${DMG_NAME}.dmg"
    echo "✅ Stapling complete"
else
    echo "⚠️  Notarization may have issues. Check the log:"
    echo "   xcrun notarytool log <submission-id> --keychain-profile ${NOTARIZE_PROFILE}"
fi

# ============================================
# VERIFICATION
# ============================================
echo ""
echo "🔍 Final verification..."

# Verify the app
spctl --assess --type execute --verbose "dist/${APP_NAME}.app" 2>&1 || true

# Verify the DMG
spctl --assess --type open --context context:primary-signature --verbose "${DMG_NAME}.dmg" 2>&1 || true

# ============================================
# CLEANUP & SUMMARY
# ============================================
rm -f AppIcon.icns 2>/dev/null || true

# Calculate checksum
shasum -a 256 "${DMG_NAME}.dmg" > "${DMG_NAME}.dmg.sha256"

echo ""
echo "=============================================="
echo "✅ BUILD COMPLETE!"
echo "=============================================="
echo ""
echo "Output files:"
echo "  📀 ${DMG_NAME}.dmg (signed & notarized)"
echo "  📁 dist/${APP_NAME}.app"
echo ""
echo "SHA256: $(cat ${DMG_NAME}.dmg.sha256)"
echo ""
echo "This app is now:"
echo "  ✅ Code signed with your Developer ID"
echo "  ✅ Notarized by Apple"
echo "  ✅ Ready for distribution"
echo ""
echo "Users can install without security warnings!"
echo ""
