"use client";

interface Props {
  title: string;
  message: string;
}

export default function ConfigRequired({ title, message }: Props) {
  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-gradient-to-br from-pink-50 via-lavender-50 to-pink-50 px-4">
      <div className="bg-white rounded-3xl p-8 shadow-[0_8px_30px_rgba(216,27,96,0.15)] max-w-md w-full text-center">
        <h2 className="font-quicksand text-xl font-bold text-pink-600 mb-2">
          {title}
        </h2>
        <p className="text-gray-500 text-sm whitespace-pre-line">
          {message}
        </p>
      </div>
    </div>
  );
}
