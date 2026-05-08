"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { QRPayload } from "@/types/release";
import { Camera, QrCode, ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function ScanPage() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function parseAndNavigate(raw: string) {
    try {
      const payload = JSON.parse(raw) as QRPayload;
      if (!payload.sessionId || !payload.escrowId || !payload.token) {
        throw new Error("Invalid QR code");
      }
      router.push(`/app/escrow/${payload.escrowId}/release`);
    } catch {
      setError("Invalid QR code. Try manual entry.");
    }
  }

  async function startScanner() {
    setError(null);
    if (!containerRef.current) return;
    const scannerId = "qr-scanner-region";

    scannerRef.current = new Html5Qrcode(scannerId);
    setScanning(true);
    try {
      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          stopScanner();
          parseAndNavigate(decodedText);
        },
        undefined
      );
    } catch (e) {
      setScanning(false);
      const msg = e instanceof Error ? e.message : "Camera not available";
      setError(`Camera error: ${msg}. Use manual entry below.`);
    }
  }

  async function stopScanner() {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop();
    }
    setScanning(false);
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualToken.trim()) return;
    // In mock mode, the token IS the session ID
    // Try treating it as a raw JSON payload or a session ID
    try {
      parseAndNavigate(manualToken.trim());
    } catch {
      toast.error("Invalid session token");
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-text-main">Scan QR Code</h1>
          <p className="text-sm text-text-muted">Scan the release QR from the receiver</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <Card className="mb-4">
        <div
          id="qr-scanner-region"
          ref={containerRef}
          className={`w-full rounded-lg overflow-hidden bg-bg-base ${scanning ? "min-h-[300px]" : "hidden"}`}
        />

        {!scanning && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
              <QrCode className="h-10 w-10 text-primary" />
            </div>
            <p className="text-text-muted text-sm text-center">
              Point your camera at the QR code shown by the receiver
            </p>
            <Button onClick={startScanner} size="lg">
              <Camera className="h-4 w-4" />
              Start Camera
            </Button>
          </div>
        )}

        {scanning && (
          <div className="mt-3 flex justify-center">
            <Button variant="secondary" size="sm" onClick={stopScanner}>
              Cancel
            </Button>
          </div>
        )}
      </Card>

      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-bg-base px-3 text-xs text-text-muted">or enter manually</span>
        </div>
      </div>

      <Card>
        <form onSubmit={handleManualSubmit} className="flex flex-col gap-3">
          <Input
            label="Session Token"
            placeholder="Paste the session token..."
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={!manualToken.trim()}>
            Continue with Token
          </Button>
        </form>
      </Card>
    </div>
  );
}
