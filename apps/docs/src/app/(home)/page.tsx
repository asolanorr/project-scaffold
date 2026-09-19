import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col justify-center text-center">
      <h1 className="mb-4 font-bold text-2xl">Scaffold</h1>
      <p>
        A production-ready starting point for web applications. Start with{" "}
        <Link href="/docs" className="font-medium underline">
          the documentation
        </Link>
        .
      </p>
    </div>
  );
}
