import { CameraView, useCameraPermissions, FlashMode } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import React, { useRef, useState, useCallback } from 'react';
import {
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Modal,
  FlatList,
  Image,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';

const { width: W } = Dimensions.get('window');

const FILTERS = [
  { id: 'none',    label: 'Original',  desc: 'No correction' },
  { id: 'deuter',  label: 'Color Fix', desc: 'Deuteranopia correction for oil paintings' },
  { id: 'compare', label: 'Compare',   desc: 'Drag to compare original vs corrected' },
];

const HISTORY_DIR = `${FileSystem.cacheDirectory}IRIS_history/`;

export default function HomeScreen() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [base64Image, setBase64Image] = useState(null);
  const [capturedUri, setCapturedUri] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('deuter');
  const [strength, setStrength] = useState(1.0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [flash, setFlash] = useState('off');
  const [showGrid, setShowGrid] = useState(false);
  const [artworkNote, setArtworkNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [saved, setSaved] = useState(false);
  const cameraRef = useRef(null);

  const ensureHistoryDir = async () => {
    const info = await FileSystem.getInfoAsync(HISTORY_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(HISTORY_DIR, { intermediates: true });
  };

  const loadHistory = async () => {
    try {
      await ensureHistoryDir();
      const files = await FileSystem.readDirectoryAsync(HISTORY_DIR);
      const items = await Promise.all(
        files.filter(f => f.endsWith('.json')).map(async f => {
          const content = await FileSystem.readAsStringAsync(`${HISTORY_DIR}${f}`);
          return JSON.parse(content);
        })
      );
      setHistory(items.sort((a, b) => b.timestamp - a.timestamp));
    } catch {}
  };

  const saveToHistory = async (uri, note, filter) => {
    try {
      await ensureHistoryDir();
      const item = { uri, note, filter, timestamp: Date.now(), id: Date.now().toString() };
      await FileSystem.writeAsStringAsync(
        `${HISTORY_DIR}${item.id}.json`,
        JSON.stringify(item)
      );
    } catch {}
  };

  if (!cameraPermission) return <View style={s.centered} />;

  if (!cameraPermission.granted) {
    return (
      <View style={s.centered}>
        <Text style={s.permTitle}>Camera Permission Required</Text>
        <Text style={s.permDesc}>IRIS needs camera access to scan museum artwork.</Text>
        <TouchableOpacity style={s.btn} onPress={requestCameraPermission}>
          <Text style={s.btnText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    setSaved(false);
    setArtworkNote('');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: true });
      if (photo?.base64) {
        setBase64Image(photo.base64);
        setCapturedUri(photo.uri);
      } else if (photo?.uri) {
        const b64 = await FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 });
        setBase64Image(b64);
        setCapturedUri(photo.uri);
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSave = async () => {
    if (!capturedUri) return;
    if (!mediaPermission?.granted) await requestMediaPermission();
    try {
      await MediaLibrary.saveToLibraryAsync(capturedUri);
      await saveToHistory(capturedUri, artworkNote, selectedFilter);
      setSaved(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Image saved to your photo library and scan history.');
    } catch {
      Alert.alert('Error', 'Could not save image.');
    }
  };

  const handleShare = async () => {
    if (!capturedUri) return;
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(capturedUri);
      } else {
        Alert.alert('Sharing not available on this device.');
      }
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  const toggleFlash = () => {
    setFlash(f => f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off');
  };

  const flashIcon = flash === 'off' ? '⚡✕' : flash === 'on' ? '⚡' : '⚡A';

  // Result screen
  if (base64Image) {
    const filter = FILTERS.find(f => f.id === selectedFilter);
    const str = strength;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#000; width:100vw; height:100vh; overflow:hidden; touch-action:pinch-zoom; }
#wrap { position:relative; width:100vw; height:100vh; overflow:hidden; }
canvas { position:absolute; top:0; left:0; width:100%; height:100%; object-fit:contain; }
#orig { z-index:1; }
#fixed { z-index:2; }
#divider { position:absolute; top:0; bottom:0; width:3px; background:white; z-index:10; box-shadow:0 0 8px rgba(0,0,0,0.8); display:none; }
#handle { position:absolute; top:50%; transform:translate(-50%,-50%); width:40px; height:40px; background:white; border-radius:50%; z-index:11; display:none; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.5); cursor:ew-resize; font-size:16px; }
#msg { position:fixed; bottom:0; left:0; right:0; text-align:center; color:#fff; font:11px sans-serif; background:rgba(0,0,0,0.55); padding:4px; z-index:20; }
#label-l { position:fixed; top:12px; left:12px; color:#fff; font:bold 11px sans-serif; background:rgba(0,0,0,0.6); padding:2px 8px; border-radius:4px; z-index:20; display:none; }
#label-r { position:fixed; top:12px; right:12px; color:#fff; font:bold 11px sans-serif; background:rgba(0,0,0,0.6); padding:2px 8px; border-radius:4px; z-index:20; display:none; }
</style>
</head>
<body>
<div id="wrap">
  <canvas id="orig"></canvas>
  <canvas id="fixed"></canvas>
  <div id="divider"></div>
  <div id="handle">⟺</div>
</div>
<div id="label-l">Original</div>
<div id="label-r">Color Fix</div>
<div id="msg">Loading...</div>
<script>
var filterType = "${selectedFilter}";
var strength = ${str};
var msg = document.getElementById('msg');

function gammaExpand(v) {
  return v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
}
function gammaCompress(v) {
  v = Math.max(0,Math.min(1,v));
  return v <= 0.0031308 ? 12.92*v : 1.055*Math.pow(v,1/2.4)-0.055;
}

function correctDeuteranopia(r, g, b, str) {
  var rl = gammaExpand(r/255);
  var gl = gammaExpand(g/255);
  var bl = gammaExpand(b/255);
  var L =  0.4002*rl + 0.7076*gl - 0.0808*bl;
  var M = -0.2263*rl + 1.1653*gl + 0.0457*bl;
  var S =  0.9182*bl;
  var Msim = 0.4942*L + 0.5058*S;
  var errM = M - Msim;
  var Lc = L;
  var Mc = Msim;
  var Sc = S + 0.7*errM;
  var rlc =  4.4679*Lc - 3.5873*Mc + 0.1193*Sc;
  var glc = -1.2186*Lc + 2.3809*Mc - 0.1624*Sc;
  var blc =  0.0497*Lc - 0.2439*Mc + 1.2045*Sc;
  var redness = rl - gl;
  var greenness = gl - rl;
  if (redness > 0.15) { rlc += redness*0.15; glc += redness*0.08; blc -= redness*0.15; }
  if (greenness > 0.12) { rlc -= greenness*0.20; blc += greenness*0.20; }
  var rFinal = gammaCompress(rlc)*255;
  var gFinal = gammaCompress(glc)*255;
  var bFinal = gammaCompress(blc)*255;
  // Blend with original based on strength
  return [
    Math.round(r + (rFinal - r) * str),
    Math.round(g + (gFinal - g) * str),
    Math.round(b + (bFinal - b) * str)
  ];
}

function applyCorrection(imageData, str) {
  var d = imageData.data;
  for (var i = 0; i < d.length; i += 4) {
    var res = correctDeuteranopia(d[i], d[i+1], d[i+2], str);
    d[i]   = Math.max(0,Math.min(255,res[0]));
    d[i+1] = Math.max(0,Math.min(255,res[1]));
    d[i+2] = Math.max(0,Math.min(255,res[2]));
  }
  return imageData;
}

var img = new Image();
img.onload = function() {
  var w = img.naturalWidth, h = img.naturalHeight;
  var co = document.getElementById('orig');
  var cf = document.getElementById('fixed');
  co.width = cf.width = w;
  co.height = cf.height = h;
  var ctxO = co.getContext('2d');
  var ctxF = cf.getContext('2d');
  ctxO.drawImage(img, 0, 0);

  if (filterType === 'none') {
    cf.style.display = 'none';
    msg.textContent = 'Original';
    return;
  }

  ctxF.drawImage(img, 0, 0);
  var id = ctxF.getImageData(0, 0, w, h);
  applyCorrection(id, strength);
  ctxF.putImageData(id, 0, 0);

  if (filterType === 'deuter') {
    co.style.display = 'none';
    msg.textContent = 'Deuteranopia correction · pinch to zoom';
  } else if (filterType === 'compare') {
    var divider = document.getElementById('divider');
    var handle = document.getElementById('handle');
    var labelL = document.getElementById('label-l');
    var labelR = document.getElementById('label-r');
    divider.style.display = 'block';
    handle.style.display = 'flex';
    labelL.style.display = 'block';
    labelR.style.display = 'block';

    function updateSplit(pct) {
      pct = Math.max(2, Math.min(98, pct));
      divider.style.left = pct + '%';
      handle.style.left = pct + '%';
      cf.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
      co.style.clipPath = 'inset(0 ' + (100-pct) + '% 0 0)';
    }
    updateSplit(50);

    var dragging = false;
    var wrap = document.getElementById('wrap');
    function getX(e) {
      var rect = wrap.getBoundingClientRect();
      var cx = e.touches ? e.touches[0].clientX : e.clientX;
      return ((cx - rect.left) / rect.width) * 100;
    }
    handle.addEventListener('mousedown', function(e){ dragging=true; e.preventDefault(); });
    handle.addEventListener('touchstart', function(e){ dragging=true; e.preventDefault(); },{passive:false});
    document.addEventListener('mousemove', function(e){ if(dragging) updateSplit(getX(e)); });
    document.addEventListener('touchmove', function(e){ if(dragging){ updateSplit(getX(e)); e.preventDefault(); } },{passive:false});
    document.addEventListener('mouseup', function(){ dragging=false; });
    document.addEventListener('touchend', function(){ dragging=false; });
    msg.textContent = 'Drag ⟺ to compare · pinch to zoom';
  }
};
img.onerror = function(){ msg.textContent = 'Image load failed'; };
img.src = 'data:image/jpeg;base64,${base64Image}';
</script>
</body>
</html>`;

    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => { setBase64Image(null); setCapturedUri(null); }}>
            <Text style={s.backBtn}>← Scan</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>IRIS</Text>
          <TouchableOpacity onPress={() => { loadHistory(); setShowHistory(true); }}>
            <Text style={s.historyBtn}>History</Text>
          </TouchableOpacity>
        </View>

        {/* Image */}
        <View style={s.webviewWrap}>
          <WebView
            source={{ html }}
            style={s.webview}
            scrollEnabled={false}
            originWhitelist={['*']}
            javaScriptEnabled={true}
          />
        </View>

        {/* Controls */}
        <ScrollView style={s.resultPanel} contentContainerStyle={s.resultPanelInner}>

          {/* Filter selector */}
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

          {/* Strength slider */}
          <Text style={s.sectionLabel}>CORRECTION STRENGTH · {Math.round(strength * 100)}%</Text>
          <View style={s.strengthRow}>
            {[0.25, 0.5, 0.75, 1.0].map(v => (
              <TouchableOpacity
                key={v}
                style={[s.strengthBtn, strength === v && s.strengthBtnActive]}
                onPress={() => setStrength(v)}
              >
                <Text style={[s.strengthText, strength === v && s.strengthTextActive]}>
                  {Math.round(v * 100)}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Artwork note */}
          <Text style={s.sectionLabel}>ARTWORK NOTE</Text>
          <TextInput
            style={s.noteInput}
            placeholder="Artist, title, gallery room..."
            placeholderTextColor={MUTED}
            value={artworkNote}
            onChangeText={setArtworkNote}
            multiline
          />

          {/* Action buttons */}
          <View style={s.actionRow}>
            <TouchableOpacity
              style={[s.actionBtn, saved && s.actionBtnDone]}
              onPress={handleSave}
              disabled={saved}
            >
              <Text style={s.actionBtnText}>{saved ? '✓ Saved' : '↓ Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={handleShare}>
              <Text style={s.actionBtnText}>↗ Share</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>

        {/* History Modal */}
        <Modal visible={showHistory} animationType="slide" onRequestClose={() => setShowHistory(false)}>
          <View style={s.modalRoot}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Scan History</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {history.length === 0 ? (
              <View style={s.emptyHistory}>
                <Text style={s.emptyText}>No saved scans yet</Text>
              </View>
            ) : (
              <FlatList
                data={history}
                keyExtractor={item => item.id}
                numColumns={2}
                contentContainerStyle={s.historyGrid}
                renderItem={({ item }) => (
                  <View style={s.historyItem}>
                    <Image source={{ uri: item.uri }} style={s.historyThumb} resizeMode="cover" />
                    {item.note ? <Text style={s.historyNote} numberOfLines={2}>{item.note}</Text> : null}
                    <Text style={s.historyDate}>{new Date(item.timestamp).toLocaleDateString()}</Text>
                  </View>
                )}
              />
            )}
          </View>
        </Modal>
      </View>
    );
  }

  // Camera screen
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>IRIS</Text>
        <View style={s.headerRight}>
          <TouchableOpacity onPress={toggleFlash} style={s.iconBtn}>
            <Text style={s.iconBtnText}>{flashIcon}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowGrid(g => !g)} style={[s.iconBtn, showGrid && s.iconBtnActive]}>
            <Text style={s.iconBtnText}>⊞</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { loadHistory(); setShowHistory(true); }} style={s.iconBtn}>
            <Text style={s.iconBtnText}>⊙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera */}
      <View style={s.cameraWrap}>
        <CameraView
          ref={cameraRef}
          style={s.camera}
          facing="back"
          flash={flash}
        />
        {/* Grid overlay */}
        {showGrid && (
          <View style={s.grid} pointerEvents="none">
            <View style={s.gridRow}>
              <View style={s.gridCell} /><View style={s.gridCell} /><View style={s.gridCell} />
            </View>
            <View style={s.gridRow}>
              <View style={s.gridCell} /><View style={s.gridCell} /><View style={s.gridCell} />
            </View>
            <View style={s.gridRow}>
              <View style={s.gridCell} /><View style={s.gridCell} /><View style={s.gridCell} />
            </View>
          </View>
        )}
      </View>

      {/* Bottom controls */}
      <View style={s.controls}>
        <Text style={s.sectionLabel}>VIEW MODE AFTER SCAN</Text>
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

      {/* History Modal */}
      <Modal visible={showHistory} animationType="slide" onRequestClose={() => setShowHistory(false)}>
        <View style={s.modalRoot}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Scan History</Text>
            <TouchableOpacity onPress={() => setShowHistory(false)}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          {history.length === 0 ? (
            <View style={s.emptyHistory}>
              <Text style={s.emptyText}>No saved scans yet</Text>
            </View>
          ) : (
            <FlatList
              data={history}
              keyExtractor={item => item.id}
              numColumns={2}
              contentContainerStyle={s.historyGrid}
              renderItem={({ item }) => (
                <View style={s.historyItem}>
                  <Image source={{ uri: item.uri }} style={s.historyThumb} resizeMode="cover" />
                  {item.note ? <Text style={s.historyNote} numberOfLines={2}>{item.note}</Text> : null}
                  <Text style={s.historyDate}>{new Date(item.timestamp).toLocaleDateString()}</Text>
                </View>
              )}
            />
          )}
        </View>
      </Modal>
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
const THUMB = (W - 48) / 2;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: INK },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PARCHMENT, padding: 32, gap: 16 },

  // Header
  header: { paddingTop: 52, paddingBottom: 10, paddingHorizontal: 16, backgroundColor: INK, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerTitle: { fontSize: 13, letterSpacing: 5, color: GREEN_LIGHT, fontWeight: '300' },
  headerRight: { flexDirection: 'row', gap: 8 },
  backBtn: { fontSize: 12, color: GREEN_LIGHT },
  historyBtn: { fontSize: 12, color: GREEN_LIGHT },
  iconBtn: { padding: 6, borderRadius: 8, borderWidth: 1, borderColor: MUTED },
  iconBtnActive: { borderColor: GREEN_LIGHT, backgroundColor: 'rgba(196,216,201,0.15)' },
  iconBtnText: { fontSize: 13, color: GREEN_LIGHT },

  // Camera
  cameraWrap: { flex: 1, marginHorizontal: 12, marginVertical: 8, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  camera: { flex: 1 },

  // Grid
  grid: { ...StyleSheet.absoluteFillObject },
  gridRow: { flex: 1, flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.3)' },
  gridCell: { flex: 1, borderRightWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.3)' },

  // Controls
  controls: { backgroundColor: PARCHMENT, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 80, gap: 10 },
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

  // Result panel
  webviewWrap: { flex: 1 },
  webview: { flex: 1, backgroundColor: '#000' },
  resultPanel: { backgroundColor: PARCHMENT, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: 280 },
  resultPanelInner: { padding: 16, gap: 10, paddingBottom: 80 },

  // Strength
  strengthRow: { flexDirection: 'row', gap: 6 },
  strengthBtn: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: WHITE },
  strengthBtnActive: { backgroundColor: GREEN, borderColor: GREEN },
  strengthText: { fontSize: 11, color: MUTED },
  strengthTextActive: { color: WHITE },

  // Note input
  noteInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 10, fontSize: 13, color: INK, backgroundColor: WHITE, minHeight: 44 },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: GREEN },
  actionBtnDone: { backgroundColor: GREEN },
  actionBtnText: { fontSize: 13, color: GREEN, fontWeight: '500' },

  // Modal
  modalRoot: { flex: 1, backgroundColor: PARCHMENT },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56, borderBottomWidth: 1, borderColor: BORDER },
  modalTitle: { fontSize: 18, color: INK, fontWeight: '400' },
  modalClose: { fontSize: 18, color: MUTED, padding: 4 },
  historyGrid: { padding: 16, gap: 12 },
  historyItem: { width: THUMB, marginRight: 16, gap: 4 },
  historyThumb: { width: THUMB, height: THUMB, borderRadius: 8, backgroundColor: BORDER },
  historyNote: { fontSize: 11, color: INK },
  historyDate: { fontSize: 10, color: MUTED },
  emptyHistory: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 16, color: MUTED },

  // Permission
  btn: { paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', borderRadius: 999, backgroundColor: GREEN },
  btnText: { fontSize: 14, fontWeight: '500', color: WHITE },
  permTitle: { fontSize: 22, color: INK, fontWeight: '400', textAlign: 'center' },
  permDesc: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 22 },
});
