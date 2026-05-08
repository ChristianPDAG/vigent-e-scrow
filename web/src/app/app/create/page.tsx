"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { addHours, addDays, formatISO } from "date-fns";
import { useEscrow } from "@/hooks/use-escrow";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { isValidSolanaAddress } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface FormValues {
  receiverWallet: string;
  amount: number;
  description: string;
  expiresPreset: "24h" | "48h" | "7d";
}

const PRESETS = [
  { value: "24h", label: "24 hours" },
  { value: "48h", label: "48 hours" },
  { value: "7d", label: "7 days" },
] as const;

export default function CreateEscrowPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const { createEscrow } = useEscrow();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { expiresPreset: "48h", amount: 0.5 },
  });

  const selectedPreset = watch("expiresPreset");

  async function onSubmit(data: FormValues) {
    if (!publicKey) return;
    const depositorWallet = publicKey.toBase58();
    if (!isValidSolanaAddress(data.receiverWallet)) {
      toast.error("Invalid receiver wallet address");
      return;
    }
    if (data.receiverWallet === depositorWallet) {
      toast.error("Receiver cannot be your own wallet");
      return;
    }
    if (!data.description || data.description.length < 3) {
      toast.error("Description is too short");
      return;
    }
    if (!data.amount || data.amount <= 0) {
      toast.error("Amount must be positive");
      return;
    }

    const expiresAt =
      data.expiresPreset === "24h"
        ? formatISO(addHours(new Date(), 24))
        : data.expiresPreset === "48h"
        ? formatISO(addHours(new Date(), 48))
        : formatISO(addDays(new Date(), 7));

    setLoading(true);
    try {
      const escrow = await createEscrow({
        receiverWallet: data.receiverWallet,
        amount: data.amount,
        tokenType: "SOL",
        description: data.description,
        expiresAt,
      });
      toast.success("Escrow created successfully");
      router.push(`/app/escrow/${escrow.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create escrow");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text-main">Create Escrow</h1>
          <p className="text-sm text-text-muted">Lock funds for a presential exchange</p>
        </div>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <Input
            label="Receiver Wallet Address"
            placeholder="Solana public key..."
            error={errors.receiverWallet?.message}
            {...register("receiverWallet")}
          />

          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Amount (SOL)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.001"
                min="0.001"
                max="1000"
                className="h-10 flex-1 rounded-lg border border-border bg-bg-elevated px-3 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                {...register("amount", { valueAsNumber: true })}
              />
              <span className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-secondary">
                SOL
              </span>
            </div>
            {errors.amount && <p className="mt-1 text-xs text-danger">{errors.amount.message}</p>}
          </div>

          <Textarea
            label="Description"
            placeholder="What is this escrow for?"
            rows={3}
            error={errors.description?.message}
            helper="Max 200 characters"
            {...register("description")}
          />

          <div>
            <label className="text-sm font-medium text-text-secondary mb-1.5 block">Expiration</label>
            <div className="flex gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setValue("expiresPreset", p.value)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    selectedPreset === p.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-bg-elevated text-text-secondary hover:border-primary/50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" loading={loading} size="lg" className="mt-2">
            Create Escrow
          </Button>
        </form>
      </Card>
    </div>
  );
}
