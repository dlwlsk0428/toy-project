import { PunchRhythm } from "@/features/punch-rhythm";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:px-6">
      <div className="flex w-full max-w-4xl flex-col items-center">
        <PunchRhythm />
      </div>
    </main>
  );
}
