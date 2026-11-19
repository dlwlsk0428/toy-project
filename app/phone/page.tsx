import { BrandLogo } from "@/components/brand-logo";
import { PhoneController } from "@/features/punch-power";

export default async function PhonePage({ searchParams }: PageProps<"/phone">) {
  const { room } = await searchParams;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
      <BrandLogo compact className="text-3xl" />
      <PhoneController room={typeof room === "string" ? room : null} />
    </main>
  );
}
