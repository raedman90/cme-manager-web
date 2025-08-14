// src/components/users/BadgeButton.tsx
import { Button } from "@/components/ui/button";
import type { UserDTO } from "@/api/users";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { toast } from "sonner";

type Props = { user: UserDTO };

const BRAND = { r: 16, g: 185, b: 129 }; // emerald-500
const TEXT_DARK = { r: 40, g: 40, b: 40 };
const TEXT_MUTED = { r: 90, g: 90, b: 90 };

async function urlToDataURL(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  const blob = await res.blob();
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export default function BadgeButton({ user }: Props) {
  async function handleGenerate() {
    try {
      // CR-80 em LANDSCAPE: 85.6 (largura) x 54 (altura)
      // Passo o formato como [54, 85.6] com orientation:'landscape' para garantir rotação,
      // e em seguida leio as dimensões reais.
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [54, 85.6] });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();

      const M = 3; // margem segura
      const innerW = W - M * 2;
      const innerH = H - M * 2;

      // Moldura da área segura
      doc.setDrawColor(220);
      doc.roundedRect(M, M, innerW, innerH, 2, 2);

      // Faixa superior (horizontal)
      const headerH = 12;
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
      doc.roundedRect(M, M, innerW, headerH, 2, 2, "F");

      // Logo (opcional)
      try {
        const logoData = await urlToDataURL("/brand/logo-escudo.png");
        const logoH = 8, logoW = 8;
        doc.addImage(logoData, "PNG", M + 2, M + (headerH - logoH) / 2, logoW, logoH, undefined, "FAST");
      } catch { /* sem logo tudo bem */ }

      // Título
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("CME Manager", M + 12, M + headerH / 2 + 3);

      // Área de conteúdo
      const contentY = M + headerH + 2;

      // Caixa do QR à direita
      const QR_BOX = 26;
      const QR_PAD = 2;
      const QR_INNER = QR_BOX - QR_PAD * 2;
      const qrBoxX = W - M - QR_BOX;
      const qrBoxY = contentY;

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(210);
      doc.roundedRect(qrBoxX, qrBoxY, QR_BOX, QR_BOX, 2, 2, "FD");

      const qrDataUrl = await QRCode.toDataURL(user.badgeCode, {
        errorCorrectionLevel: "H",
        margin: 0,
        width: 600,
      });
      doc.addImage(qrDataUrl, "PNG", qrBoxX + QR_PAD, qrBoxY + QR_PAD, QR_INNER, QR_INNER, undefined, "FAST");

      // Foto no canto inferior esquerdo
      const photoSize = 24;
      const photoX = M + 2;
      const photoY = H - M - photoSize - 2;

      doc.setDrawColor(210);
      doc.setFillColor(255, 255, 255);
      doc.rect(photoX - 0.5, photoY - 0.5, photoSize + 1, photoSize + 1, "FD");

      if (user.photoUrl) {
        try {
          const photoData = await urlToDataURL(user.photoUrl);
          // tenta JPEG e cai para PNG se necessário
          try {
            doc.addImage(photoData, "JPEG", photoX, photoY, photoSize, photoSize, undefined, "FAST");
          } catch {
            doc.addImage(photoData, "PNG", photoX, photoY, photoSize, photoSize, undefined, "FAST");
          }
        } catch {
          doc.setFontSize(7);
          doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
          doc.text("(Foto)", photoX + 7.5, photoY + photoSize / 2, { baseline: "middle" });
        }
      } else {
        doc.setFontSize(7);
        doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
        doc.text("(Foto)", photoX + 7.5, photoY + photoSize / 2, { baseline: "middle" });
      }

      // Coluna de texto entre a foto e o QR
      const textX = photoX + photoSize + 4;
      const textRight = qrBoxX - 3;
      const textW = Math.max(10, textRight - textX);
      let y = contentY + 3;

      doc.setTextColor(TEXT_DARK.r, TEXT_DARK.g, TEXT_DARK.b);
      doc.setFont("helvetica", "bold");

      let nameFont = 12;
      let lines = doc.splitTextToSize(user.name, textW);
      if (lines.length > 2) nameFont = 11;
      doc.setFontSize(nameFont);
      doc.text(lines, textX, y);
      y += 5 + (lines.length - 1) * 4.6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
      doc.text(`Cargo: ${user.role}`, textX, y);
      y += 4.4;

      doc.setFontSize(8);
      doc.text(`ID: ${user.badgeCode}`, textX, y);

      // Observação/rodapé
      doc.setFontSize(7);
      doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
      doc.text("Validação: QR → assinatura de etapas", qrBoxX, H - M - 5);

      // Salvar
      doc.save(`cracha_${user.badgeCode}.pdf`);
      toast.success("Crachá gerado!");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao gerar o crachá");
    }
  }

  return (
    <Button variant="outline" onClick={handleGenerate}>
      Gerar Crachá (PDF)
    </Button>
  );
}
