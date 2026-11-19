import { PhoneController } from "@/features/punch-power";

export default async function PhonePage({ searchParams }: PageProps<"/phone">) {
  const { room } = await searchParams;
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
      <PhoneController room={typeof room === "string" ? room : null} />
    </main>
  );
}
