import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import React, { useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';

const { width: W } = Dimensions.get('window');

const FILTERS = [
  { id: 'none',         label: 'Original',      description: 'No filter' },
  { id: 'deuteranopia', label: 'Red-Green Fix',  description: 'Daltonize: red-green correction' },
  { id: 'grayscale',    label: 'Grayscale Test', description: 'Converts to grayscale — confirms pipeline works' },
];

export default function HomeScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState('deuteranopia');
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  if (!cameraPermission) return <View style={s.centered} />;

  if (!cameraPermission.granted) {
    return (
      <View style={s.centered}>
        <Text style={s.permTitle}>Camera Permission Required</Text>
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
      // Take photo at lower quality to keep base64 small
      const photo = await cameraRef.current.takePictureAsync({ 
        quality: 0.3,
        base64: true,
      });
      if (photo?.base64) {
        setBase64Image(photo.base64);
      } else if (photo?.uri) {
        const b64 = await FileSystem.readAsStringAsync(photo.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        setBase64Image(b64);
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setIsCapturing(false);
    }
  };

  // Result screen
  if (base64Image) {
    const filter = FILTERS.find(f => f.id === selectedFilter);

    const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#000; width:100vw; height:100vh; overflow:hidden; }
canvas { width:100%; height:100%; object-fit:contain; }
#msg { position:fixed; bottom:8px; left:0; right:0; text-align:center; color:#aaa; font:11px sans-serif; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="msg">Loading...</div>
<script>
var filterType = "${selectedFilter}";
var canvas = document.getElementById('c');
var ctx = canvas.getContext('2d');
var msg = document.getElementById('msg');
var img = new Image();

img.onload = function() {
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  if (filterType === 'none') {
    msg.textContent = 'Original — no filter';
    return;
  }

  try {
    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var d = imageData.data;
    var count = 0;

    for (var i = 0; i < d.length; i += 4) {
      var r = d[i];
      var g = d[i+1];
      var b = d[i+2];

      if (filterType === 'grayscale') {
        // Simple grayscale — very visible change
        var gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        d[i]   = gray;
        d[i+1] = gray;
        d[i+2] = gray;
      } else if (filterType === 'deuteranopia') {
        // Daltonize deuteranopia
        var rf = r / 255;
        var gf = g / 255;
        var bf = b / 255;
        // Simulate deuteranope vision
        var rs = 0.625 * rf + 0.375 * gf;
        var gs = 0.700 * gf + 0.300 * bf;
        var bs = 0.300 * gf + 0.700 * bf;
        // Error between normal and simulated
        var er = rf - rs;
        var eg = gf - gs;
        var eb = bf - bs;
        // Shift error into visible channels
        var rn = rf;
        var gn = gf + 0.7 * er + eg;
        var bn = bf + 0.7 * er + eb;
        // Clamp
        rn = Math.max(0, Math.min(1, rn));
        gn = Math.max(0, Math.min(1, gn));
        bn = Math.max(0, Math.min(1, bn));
        d[i]   = Math.round(rn * 255);
        d[i+1] = Math.round(gn * 255);
        d[i+2] = Math.round(bn * 255);
      }
      count++;
    }

    ctx.putImageData(imageData, 0, 0);
    msg.textContent = filterType + ' applied to ' + count + ' pixels OK';
  } catch(e) {
    msg.textContent = 'Error: ' + e.message;
  }
};

img.onerror = function(e) {
  msg.textContent = 'Image load failed';
};

msg.textContent = 'Decoding image...';
img.src = 'data:image/jpeg;base64,${base64Image}';
</script>
</body>
</html>`;

    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />
        <View style={s.header}>
          <Text style={s.headerTitle}>CHROMA</Text>
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
          <Text style={s.sectionLabel}>SELECT FILTER</Text>
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
          <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setBase64Image(null)}>
            <Text style={[s.btnText, { color: '#4A7A5E' }]}>Scan Again</Text>
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
        <Text style={s.headerSub}>Museum Color Aid</Text>
      </View>

      <View style={s.cameraWrap}>
        <CameraView ref={cameraRef} style={s.camera} facing="back" />
      </View>

      <View style={s.controls}>
        <Text style={s.sectionLabel}>FILTER</Text>
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
            {isCapturing ? 'Processing...' : 'Tap to scan artwork'}
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
  headerSub: { fontSize: 10, color: MUTED, letterSpacing: 2, marginTop: 2 },
  cameraWrap: { flex: 1, marginHorizontal: 16, marginVertical: 10, borderRadius: 12, overflow: 'hidden' },
  camera: { flex: 1 },
  controls: { backgroundColor: PARCHMENT, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 36, gap: 10 },
  sectionLabel: { fontSize: 9, letterSpacing: 2, color: MUTED, fontWeight: '500' },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterPill: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: BORDER, backgroundColor: WHITE },
  filterPillActive: { backgroundColor: GREEN, borderColor: GREEN },
  filterPillText: { fontSize: 10, color: MUTED, textAlign: 'center' },
  filterPillTextActive: { color: WHITE, fontWeight: '500' },
  captureRow: { alignItems: 'center', gap: 6, marginTop: 4 },
  captureBtn: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  captureBtnDisabled: { borderColor: BORDER },
  captureInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: GREEN },
  captureHint: { fontSize: 11, color: MUTED },
  webviewWrap: { flex: 1 },
  webview: { flex: 1, backgroundColor: '#000' },
  btn: { paddingVertical: 14, alignItems: 'center', borderRadius: 999 },
  btnOutline: { borderWidth: 1, borderColor: GREEN },
  btnText: { fontSize: 14, fontWeight: '500', color: WHITE },
  permTitle: { fontSize: 22, color: INK, fontWeight: '400', textAlign: 'center' },
});
