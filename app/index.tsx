import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import React, { useRef, useState } from 'react';
import {
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';

const FILTERS = [
  { id: 'none',          label: 'Original',      desc: 'No correction applied' },
  { id: 'high_contrast', label: 'Color Fix',      desc: 'Red-green separation for color blindness' },
  { id: 'compare',       label: 'Compare',        desc: 'Original vs corrected side by side' },
];

export default function HomeScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [base64Image, setBase64Image] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('high_contrast');
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef(null);

  if (!cameraPermission) return <View style={s.centered} />;

  if (!cameraPermission.granted) {
    return (
      <View style={s.centered}>
        <Text style={s.permTitle}>Camera Permission Required</Text>
        <Text style={s.permDesc}>Chroma needs camera access to scan artwork.</Text>
        <TouchableOpacity style={s.btn} onPress={requestCameraPermission}>
          <Text style={s.btnText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.3, base64: true });
      if (photo && photo.base64) {
        setBase64Image(photo.base64);
      } else if (photo && photo.uri) {
        const b64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 });
        setBase64Image(b64);
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setIsCapturing(false);
    }
  };

  if (base64Image) {
    const filter = FILTERS.find(f => f.id === selectedFilter);

    const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#000; width:100vw; height:100vh; overflow:hidden; }
#wrap { width:100vw; height:100vh; display:flex; align-items:center; justify-content:center; }
#wrap canvas { max-width:100vw; max-height:100vh; object-fit:contain; display:block; }
#compare-wrap { display:none; width:100vw; height:100vh; flex-direction:row; }
#compare-wrap canvas { width:50%; height:100%; object-fit:contain; }
#msg { position:fixed; bottom:0; left:0; right:0; text-align:center; color:#fff; font:11px sans-serif; background:rgba(0,0,0,0.65); padding:4px; }
#lb { position:fixed; bottom:20px; left:6px; color:#fff; font:bold 11px sans-serif; background:rgba(0,0,0,0.7); padding:2px 8px; border-radius:4px; display:none; }
#rb { position:fixed; bottom:20px; right:6px; color:#fff; font:bold 11px sans-serif; background:rgba(0,0,0,0.7); padding:2px 8px; border-radius:4px; display:none; }
</style>
</head>
<body>
<div id="wrap"><canvas id="c"></canvas></div>
<div id="compare-wrap"><canvas id="co"></canvas><canvas id="cf"></canvas></div>
<div id="lb">Original</div>
<div id="rb">Color Fix</div>
<div id="msg">Loading...</div>
<script>
var filterType = "${selectedFilter}";

function highContrast(r, g, b) {
  var rf = r/255, gf = g/255, bf = b/255;
  var redness  = rf - gf;
  var greenness = gf - rf;
  var rn = rf, gn = gf, bn = bf;
  if (redness > 0.05) {
    // Reds -> bright orange/yellow (very visible)
    rn = Math.min(1, rf + 0.35);
    gn = Math.min(1, gf + 0.20);
    bn = Math.max(0, bf - 0.40);
  } else if (greenness > 0.05) {
    // Greens -> strong teal/blue (very visible)
    rn = Math.max(0, rf - 0.35);
    gn = Math.min(1, gf + 0.10);
    bn = Math.min(1, bf + 0.50);
  }
  return [
    Math.round(Math.max(0,Math.min(1,rn))*255),
    Math.round(Math.max(0,Math.min(1,gn))*255),
    Math.round(Math.max(0,Math.min(1,bn))*255)
  ];
}

function applyHighContrast(data) {
  for (var i = 0; i < data.length; i += 4) {
    var result = highContrast(data[i], data[i+1], data[i+2]);
    data[i] = result[0]; data[i+1] = result[1]; data[i+2] = result[2];
  }
}

var img = new Image();
img.onload = function() {
  var msg = document.getElementById('msg');

  if (filterType === 'compare') {
    document.getElementById('wrap').style.display = 'none';
    document.getElementById('compare-wrap').style.display = 'flex';
    document.getElementById('lb').style.display = 'block';
    document.getElementById('rb').style.display = 'block';

    var co = document.getElementById('co');
    co.width = img.naturalWidth; co.height = img.naturalHeight;
    var ctxo = co.getContext('2d');
    ctxo.drawImage(img, 0, 0);

    var cf = document.getElementById('cf');
    cf.width = img.naturalWidth; cf.height = img.naturalHeight;
    var ctxf = cf.getContext('2d');
    ctxf.drawImage(img, 0, 0);
    var id = ctxf.getImageData(0, 0, cf.width, cf.height);
    applyHighContrast(id.data);
    ctxf.putImageData(id, 0, 0);
    msg.textContent = 'Left: Original  |  Right: Color Fix';

  } else {
    var canvas = document.getElementById('c');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    if (filterType === 'high_contrast') {
      var id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      applyHighContrast(id.data);
      ctx.putImageData(id, 0, 0);
      msg.textContent = 'Color Fix applied';
    } else {
      msg.textContent = 'Original — no filter';
    }
  }
};

img.onerror = function() {
  document.getElementById('msg').textContent = 'Image load failed';
};

img.src = 'data:image/jpeg;base64,${base64Image}';
</script>
</body>
</html>`;

    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />
        <View style={s.header}>
          <Text style={s.headerTitle}>CHROMA</Text>
          <Text style={s.headerSub}>{filter?.desc}</Text>
        </View>

        <View style={s.webviewWrap}>
          <WebView
            source={{ html }}
            style={s.webview}
            scrollEnabled={false}
            originWhitelist={['*']}
            javaScriptEnabled={true}
          />
        </View>

        <View style={s.controls}>
          <Text style={s.sectionLabel}>VIEW MODE</Text>
          <View style={s.filterRow}>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[s.filterPill, selectedFilter === f.id && s.filterPillActive]}
                onPress={() => setSelectedFilter(f.id)}
              >
                <Text style={[s.filterPillText, selectedFilter === f.id && s.filterPillTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.btnOutline} onPress={() => setBase64Image(null)}>
            <Text style={s.btnOutlineText}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Camera screen
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <Text style={s.headerTitle}>CHROMA</Text>
        <Text style={s.headerSub}>Museum Color Aid · Red-Green Color Blindness</Text>
      </View>

      <View style={s.cameraWrap}>
        <CameraView ref={cameraRef} style={s.camera} facing="back" />
      </View>

      <View style={s.controls}>
        <Text style={s.sectionLabel}>VIEW MODE</Text>
        <View style={s.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.id}
              style={[s.filterPill, selectedFilter === f.id && s.filterPillActive]}
              onPress={() => setSelectedFilter(f.id)}
            >
              <Text style={[s.filterPillText, selectedFilter === f.id && s.filterPillTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.captureRow}>
          <TouchableOpacity
            style={[s.captureBtn, isCapturing && s.captureBtnDisabled]}
            onPress={handleCapture}
            disabled={isCapturing}
          >
            {isCapturing
              ? <ActivityIndicator color="#fff" />
              : <View style={s.captureInner} />
            }
          </TouchableOpacity>
          <Text style={s.captureHint}>
            {isCapturing ? 'Processing...' : 'Point at artwork and tap to scan'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const GREEN = '#4A7A5E';
const GREEN_LIGHT = '#C4D8C9';
const INK = '#1A1510';
const PARCHMENT = '#F5F0E8';
const MUTED = '#6B6057';
const BORDER = '#D9D1C0';
const WHITE = '#FFFFFF';

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PARCHMENT, padding: 32, gap: 16 },
  header: { paddingTop: 52, paddingBottom: 10, paddingHorizontal: 20, backgroundColor: INK },
  headerTitle: { fontSize: 13, letterSpacing: 5, color: GREEN_LIGHT, fontWeight: '300' },
  headerSub: { fontSize: 10, color: MUTED, letterSpacing: 1, marginTop: 2 },
  cameraWrap: { flex: 1, marginHorizontal: 16, marginVertical: 10, borderRadius: 12, overflow: 'hidden' },
  camera: { flex: 1 },
  controls: { backgroundColor: PARCHMENT, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 36, gap: 10 },
  sectionLabel: { fontSize: 9, letterSpacing: 2, color: MUTED, fontWeight: '500' },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: BORDER, backgroundColor: WHITE },
  filterPillActive: { backgroundColor: GREEN, borderColor: GREEN },
  filterPillText: { fontSize: 11, color: MUTED, textAlign: 'center' },
  filterPillTextActive: { color: WHITE, fontWeight: '500' },
  captureRow: { alignItems: 'center', gap: 6, marginTop: 4 },
  captureBtn: { width: 68, height: 68, borderRadius: 34, borderWidth: 3, borderColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  captureBtnDisabled: { borderColor: BORDER },
  captureInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: GREEN },
  captureHint: { fontSize: 11, color: MUTED },
  webviewWrap: { flex: 1 },
  webview: { flex: 1, backgroundColor: '#000' },
  btn: { paddingVertical: 14, alignItems: 'center', borderRadius: 999, backgroundColor: GREEN },
  btnText: { fontSize: 14, fontWeight: '500', color: WHITE },
  btnOutline: { paddingVertical: 12, alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: GREEN },
  btnOutlineText: { fontSize: 13, color: GREEN },
  permTitle: { fontSize: 22, color: INK, fontWeight: '400', textAlign: 'center' },
  permDesc: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 22 },
});
