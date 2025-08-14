import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onResult: (text: string) => void;
};

export default function ScanCodeDialog({ open, onOpenChange, onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<import("@zxing/browser").IScannerControls | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [torchOn, setTorchOn] = useState(false);
  const [lastErr, setLastErr] = useState<string>("");

  // prepara hints + instancia reader (com opções corretas)
  useEffect(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.ITF,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.PDF_417,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    readerRef.current = new BrowserMultiFormatReader(hints, {
      delayBetweenScanSuccess: 200,
      delayBetweenScanAttempts: 500,
    });

    return () => {
      // garante stop ao desmontar
      controlsRef.current?.stop();
      controlsRef.current = null;
      readerRef.current = null;
    };
  }, []);

  // lista câmeras quando abrir
  useEffect(() => {
    if (!open) return;
    (async () => {
      const devs = await BrowserMultiFormatReader.listVideoInputDevices();
      setDevices(devs);
      const back = devs.find((d) => /back|traseira|environment/i.test(d.label));
      setDeviceId((back || devs[0])?.deviceId);
    })();
  }, [open]);

  // inicia/para a leitura
  useEffect(() => {
    if (!open || !deviceId || !readerRef.current || !videoRef.current) return;

    let cancelled = false;
    setLastErr("");

    (async () => {
      try {
        // começa a ler continuamente; guarde os controls p/ parar depois
        controlsRef.current = await readerRef.current!.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (res, err) => {
            if (cancelled) return;
            if (res) {
              onResult(res.getText());
              handleClose();
            } else if (err && !(err instanceof NotFoundException)) {
              setLastErr(String(err));
            }
          }
        );
      } catch (e: any) {
        setLastErr(String(e?.message ?? e));
      }
    })();

    return () => {
      cancelled = true;
      // para o loop de leitura corretamente (no lugar de reader.reset())
      controlsRef.current?.stop();
      controlsRef.current = null;

      // solta a câmera explicitamente
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [open, deviceId, onResult]);

  function handleClose() {
    onOpenChange(false);
  }

  async function toggleTorch() {
    try {
      const next = !torchOn;
      await controlsRef.current?.switchTorch?.(next);
      setTorchOn(next);
    } catch {
      // sem suporte em alguns browsers/devices
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !readerRef.current) return;
    const url = URL.createObjectURL(file);
    try {
      const res = await readerRef.current.decodeFromImageUrl(url);
      onResult(res.getText());
      handleClose();
    } catch {
      setLastErr("Não foi possível ler a imagem selecionada.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escanear código</DialogTitle>
          <DialogDescription>Aponte a câmera para o QR ou código de barras.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* controles */}
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="rounded border px-2 py-1 text-sm"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>
              ))}
            </select>

            <label className="text-sm ml-auto">Imagem (fallback):</label>
            <Input type="file" accept="image/*" onChange={handleFile} className="max-w-[220px]" />

            <Button type="button" variant="outline" onClick={toggleTorch}>
              {torchOn ? "Desligar flash" : "Ligar flash"}
            </Button>
          </div>

          {/* vídeo + moldura */}
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black">
            <video ref={videoRef} autoPlay muted playsInline className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-40 w-40 border-2 border-white/80 rounded" />
            </div>
          </div>

          {/* feedback */}
          <p className="text-xs text-muted-foreground">
            Dica: boa iluminação, enquadre no quadrado e aproxime até focar.
          </p>
          {lastErr && <p className="text-xs text-amber-600">Aviso: {lastErr}</p>}

          <ManualEntry onSubmit={(v) => { onResult(v); handleClose(); }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManualEntry({ onSubmit }: { onSubmit: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSubmit(v.trim()); }}
    >
      <Input placeholder="Ou digite/cole o código" value={v} onChange={(e) => setV(e.target.value)} />
      <Button type="submit" variant="secondary">Usar</Button>
    </form>
  );
}
