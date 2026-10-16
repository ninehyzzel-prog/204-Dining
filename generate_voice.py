import asyncio
import argparse
import os
import edge_tts

VOICE = "ko-KR-InJoonNeural"
RATE = "-5%"
PITCH = "-2Hz"

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True, help="Dish id or filename prefix")
    parser.add_argument("--text", required=True, help="Text to speak")
    args = parser.parse_args()

    output_dir = os.path.join(os.path.dirname(__file__), "204_DINING_Landscape", "assets", "audio")
    os.makedirs(output_dir, exist_ok=True)
    filename = f"dish_{args.id}.mp3"
    filepath = os.path.join(output_dir, filename)

    print(f"Generating audio for Dish {args.id}: {args.text[:30]}...")
    communicate = edge_tts.Communicate(args.text, VOICE, rate=RATE, pitch=PITCH)
    await communicate.save(filepath)
    print(f"Saved: {filepath} ({os.path.getsize(filepath)} bytes)")

if __name__ == "__main__":
    asyncio.run(main())
