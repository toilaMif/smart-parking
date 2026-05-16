import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { CameraView, useCameraPermissions } from "expo-camera";

function parseQrData(value) {
  if (!value) {
    return [];
  }

  return value.split("|").map((item, index) => ({
    id: `${index}-${item}`,
    value: item.trim(),
  }));
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [scanResult, setScanResult] = useState("");

  const parsedData = useMemo(() => parseQrData(scanResult), [scanResult]);
  const hasPermission = permission?.granted;

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  function handleBarcodeScanned(result) {
    if (!scanning) {
      return;
    }

    setScanning(false);
    setScanResult(result.data || "");
  }

  async function copyResult() {
    if (!scanResult) {
      return;
    }

    await Clipboard.setStringAsync(scanResult);
    Alert.alert("Da copy", "Noi dung QR da duoc copy.");
  }

  function openResult() {
    if (!scanResult || !scanResult.startsWith("http")) {
      return;
    }

    Linking.openURL(scanResult);
  }

  function resetScanner() {
    setScanResult("");
    setScanning(true);
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.title}>Dang kiem tra camera...</Text>
      </SafeAreaView>
    );
  }

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.centerPage}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.title}>Can quyen camera</Text>
        <Text style={styles.description}>Khach hang can cho phep camera de quet ma QR gui xe.</Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Cap quyen camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Smart Parking</Text>
        <Text style={styles.title}>Quet QR gui xe</Text>
      </View>

      <View style={styles.cameraWrap}>
        {scanning ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        ) : (
          <View style={styles.scanDone}>
            <Text style={styles.scanDoneText}>Da quet thanh cong</Text>
          </View>
        )}
        <View style={styles.scanBox} />
      </View>

      <ScrollView style={styles.resultPanel} contentContainerStyle={styles.resultContent}>
        <Text style={styles.label}>Noi dung QR</Text>
        <Text style={styles.resultText}>{scanResult || "Dua camera vao ma QR de quet."}</Text>

        {parsedData.length > 1 ? (
          <View style={styles.detailList}>
            {parsedData.map((item) => (
              <View key={item.id} style={styles.detailItem}>
                <Text style={styles.detailText}>{item.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Pressable style={styles.primaryButton} onPress={resetScanner}>
            <Text style={styles.primaryButtonText}>{scanResult ? "Quet lai" : "Bat dau quet"}</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={copyResult} disabled={!scanResult}>
            <Text style={styles.secondaryButtonText}>Copy</Text>
          </Pressable>

          {scanResult.startsWith("http") ? (
            <Pressable style={styles.secondaryButton} onPress={openResult}>
              <Text style={styles.secondaryButtonText}>Mo link</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#18242d",
  },
  centerPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f4f7fb",
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 14,
  },
  eyebrow: {
    color: "#8ed2e4",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    marginTop: 6,
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "900",
  },
  description: {
    marginVertical: 16,
    color: "#536273",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  cameraWrap: {
    height: 420,
    marginHorizontal: 16,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#000000",
  },
  camera: {
    flex: 1,
  },
  scanBox: {
    position: "absolute",
    top: "22%",
    left: "12%",
    width: "76%",
    height: "56%",
    borderWidth: 3,
    borderColor: "#f0b84b",
    borderRadius: 18,
  },
  scanDone: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#21313d",
  },
  scanDoneText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },
  resultPanel: {
    flex: 1,
    marginTop: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#ffffff",
  },
  resultContent: {
    padding: 22,
    paddingBottom: 40,
  },
  label: {
    color: "#126180",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  resultText: {
    marginTop: 10,
    color: "#17202a",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 25,
  },
  detailList: {
    marginTop: 14,
    gap: 8,
  },
  detailItem: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#eef4f7",
  },
  detailText: {
    color: "#21313d",
    fontSize: 15,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 20,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 18,
    backgroundColor: "#126180",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 18,
    backgroundColor: "#e8edf3",
  },
  secondaryButtonText: {
    color: "#17202a",
    fontSize: 15,
    fontWeight: "900",
  },
});
