import asyncio
import os
import edge_tts

VOICE = "ko-KR-InJoonNeural" # Warm, calm, dignified male host/chef voice
RATE = "-5%" # Slightly unhurried tempo for fine-dining luxury feel
PITCH = "-2Hz"

AUDIOS = {
    "welcome.mp3": "이공사 다이닝에 오신 것을 진심으로 환영합니다. 오늘 저녁을 위해 천천히 준비한 하나의 식탁입니다.",
    "chef.mp3": "좋은 음식은 함께하는 사람에게서 완성됩니다. 한 끼의 식사를 위해 준비한 재료와 시간, 오늘 이 자리가 오래도록 기억될 수 있도록 정성스럽게 준비했습니다.",
    "menu_index.mp3": "계절의 좋은 재료로 정성껏 준비한 오늘 저녁의 메뉴 구성입니다.",
    "dish_1.mp3": "북해도 관자 요리입니다. 상큼한 유자와 화이트 아스파라거스, 그리고 캐비어를 곁들여 바다의 신선함을 담아냈습니다.",
    "dish_2.mp3": "푸아그라 요리입니다. 깊고 은은한 블랙 트러플과 달콤한 살구, 고소한 브리오슈를 함께 곁들였습니다.",
    "dish_3.mp3": "메인 랍스터입니다. 향긋한 샤프란 뵈르블랑 소스와 신선한 가든 허브로 풍미를 극대화했습니다.",
    "dish_4.mp3": "한우 안심과 트러플입니다. 정성스럽게 구운 최상급 한우 안심에 트러플의 깊은 향과 부드러운 셀러리악 퓌레를 더했습니다.",
    "dish_5.mp3": "트러플 아뇰로티입니다. 파르미지아노 레지아노 치즈와 브라운 버터의 짙은 풍미가 살아있는 수제 파스타입니다.",
    "dish_6.mp3": "바닐라 앤 페어입니다. 통카빈과 고소한 헤이즐넛, 산뜻한 서양배 소르베로 식사를 깔끔하게 마무리해 드립니다.",
    "order_complete.mp3": "주문이 정성스럽게 접수되었습니다. 마음을 다해 준비해 드리겠습니다. 오늘의 식사를 천천히 즐겨주세요."
}

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "204_DINING_Landscape", "assets", "audio")

async def generate_all():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Generating natural voice audio files into: {OUTPUT_DIR}")
    for filename, text in AUDIOS.items():
        filepath = os.path.join(OUTPUT_DIR, filename)
        print(f"Generating {filename}...")
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
        await communicate.save(filepath)
        print(f"Saved {filename} ({os.path.getsize(filepath)} bytes)")
    print("All audio files generated successfully!")

if __name__ == "__main__":
    asyncio.run(generate_all())
