import Image from "next/image";
import Link from "next/link";
import { Lock, Users, QrCode, Shield, Zap, Globe } from "lucide-react";

const steps = [
  {
    icon: Lock,
    title: "Lock",
    description:
      "Deposit funds into a secure on-chain escrow. Funds are locked in a Solana program — no one can access them without both parties.",
    color: "text-[#8B5CF6]",
    bg: "bg-[#8B5CF6]/10 border-[#8B5CF6]/20",
  },
  {
    icon: Users,
    title: "Meet",
    description:
      "Arrange a physical meeting with the other party. When you're face-to-face, initiate the release ceremony.",
    color: "text-[#14F1D9]",
    bg: "bg-[#14F1D9]/10 border-[#14F1D9]/20",
  },
  {
    icon: QrCode,
    title: "Scan & Release",
    description:
      "The receiver generates a secure QR code. The depositor scans it and both parties confirm. Funds are released instantly on-chain.",
    color: "text-[#7CFF6B]",
    bg: "bg-[#7CFF6B]/10 border-[#7CFF6B]/20",
  },
];

const features = [
  {
    icon: Shield,
    title: "Non-Custodial",
    description: "Funds locked in a Solana program. Only released with mutual consent.",
  },
  {
    icon: Zap,
    title: "Instant Settlement",
    description: "When both parties confirm, settlement is instant on Solana.",
  },
  {
    icon: QrCode,
    title: "Presential Verification",
    description: "Time-limited QR codes ensure physical presence — not remote approval.",
  },
  {
    icon: Globe,
    title: "No Middleman",
    description: "Peer-to-peer. No banks, no escrow agents, no trust required.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0B1020]">
      {/* Nav */}
      <nav className="border-b border-[#263252] px-4 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.jpeg"
              alt="Vigent-E-Scrow logo"
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg object-cover"
              priority
            />
            <span className="font-semibold text-[#F5F7FF]">Vigent-E-Scrow</span>
          </div>
          <Link
            href="/app"
            className="rounded-lg bg-[#8B5CF6] px-4 py-2 text-sm font-medium text-white hover:bg-[#7C3AED] transition-colors"
          >
            Launch App
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 py-24 text-center">
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full bg-[#8B5CF6]/10 blur-[120px]" />
        <div className="pointer-events-none absolute top-20 right-1/4 h-[300px] w-[300px] rounded-full bg-[#14F1D9]/5 blur-[80px]" />

        <div className="relative mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#263252] bg-[#11182D] px-4 py-1.5 text-sm text-[#A7B0C5]">
            <span className="h-2 w-2 rounded-full bg-[#7CFF6B] animate-pulse" />
            Built on Solana
          </div>

          <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight text-[#F5F7FF] md:text-6xl">
            Presential Escrow{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg, #8B5CF6, #14F1D9)" }}
            >
              on Solana
            </span>
          </h1>

          <p className="mb-10 text-lg text-[#A7B0C5] max-w-xl mx-auto leading-relaxed">
            Lock funds on-chain. Meet in person. Release with a QR scan. Trustless
            peer-to-peer transactions for the physical world.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/app"
              className="rounded-xl bg-[#8B5CF6] px-8 py-3 text-base font-semibold text-white hover:bg-[#7C3AED] transition-all hover:scale-105 active:scale-95"
            >
              Launch App →
            </Link>
            <a
              href="#how-it-works"
              className="rounded-xl border border-[#263252] bg-[#11182D] px-8 py-3 text-base font-medium text-[#A7B0C5] hover:text-[#F5F7FF] transition-colors"
            >
              How it works
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#F5F7FF] mb-3">How it works</h2>
            <p className="text-[#A7B0C5]">Three steps to trustless physical transactions</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="rounded-xl border border-[#263252] bg-[#11182D] p-6 relative"
              >
                <div className="absolute -top-3 -left-3 h-7 w-7 rounded-full border border-[#263252] bg-[#0B1020] flex items-center justify-center text-xs font-bold text-[#7C879F]">
                  {i + 1}
                </div>
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border ${step.bg}`}>
                  <step.icon className={`h-6 w-6 ${step.color}`} />
                </div>
                <h3 className="text-xl font-bold text-[#F5F7FF] mb-2">{step.title}</h3>
                <p className="text-[#A7B0C5] text-sm leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-20" style={{ backgroundColor: "rgba(17,24,45,0.4)" }}>
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-[#F5F7FF] mb-3">Why Vigent-E-Scrow?</h2>
            <p className="text-[#A7B0C5]">Built for the real world, secured by Solana</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-[#263252] bg-[#11182D] p-5">
                <f.icon className="h-6 w-6 text-[#8B5CF6] mb-3" />
                <h3 className="font-semibold text-[#F5F7FF] mb-1">{f.title}</h3>
                <p className="text-xs text-[#A7B0C5] leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-24 text-center">
        <div className="mx-auto max-w-xl">
          <h2 className="text-3xl font-bold text-[#F5F7FF] mb-4">Ready to try it?</h2>
          <p className="text-[#A7B0C5] mb-8">
            Connect your Solana wallet and create your first presential escrow in seconds.
          </p>
          <Link
            href="/app"
            className="inline-block rounded-xl bg-[#8B5CF6] px-10 py-4 text-base font-semibold text-white hover:bg-[#7C3AED] transition-all hover:scale-105"
          >
            Get Started →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#263252] px-4 py-6 text-center text-xs text-[#7C879F]">
        <p>Vigent-E-Scrow — Built for Solana Hackathon 2025</p>
      </footer>
    </div>
  );
}
