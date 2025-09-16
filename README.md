## Для чого створено цей грув
Застосунок створює компактну, синхронну ритм‑секцію, щоб користувач міг паралельно грати на власному інструменті (гітара тощо), імпровізувати й відчувати себе учасником віртуальної групи. Уся «рутинна» збірка інших партій не відволікає: ви зосереджуєтеся лише на грі.

## Опис застосунку
Groove Generator — це веб‑застосунок на Next.js для швидкого створення багатошарових музичних грувів. Ви додаєте інструменти голосом або кнопками (наприклад, “jazz drums”, “rock guitar”), і застосунок за допомогою ElevenLabs генерує окремі треки кожного інструмента (без домішок інших), синхронізовані за темпом і призначені для безшовного зациклення.
Основна ідея: пошарово збирати грув з ізольованих партій інструментів (ударні, бас, гітара, фортепіано, саксофон, труба, маракаси).
Голосове керування: підтримка англійських і російських команд через webkitSpeechRecognition.
Генерація музики (AI): запити до https://api.elevenlabs.io/v1/music/compose з тривалістю, розрахованою під обраний BPM і розмір 4/4 для цілісних музичних фраз; вивід MP3 44.1kHz/128kbps.
Плеєр і синхронний старт: Web Audio API для ідеально безшовних лупів і синхронного відтворення всіх треків; fallback на HTML5 audio за потреби.
Керування доріжками: mute/unmute, видалення, старт/стоп усіх; історія дій.
Темп: вибір BPM і пресети; показ розрахованої тривалості в тактах/секундах; попередження при зміні темпу з уже доданими треками.
Збереження стану: доріжки зберігаються в localStorage і відновлюються після перезавантаження.
Технології: Next.js 15 (App Router), React 19, Tailwind CSS 4, Framer Motion, Lucide Icons; потрібен NEXT_PUBLIC_ELEVEN_API_KEY для генерації музики.

## Фішки економії токенів і витрат
Ізольована генерація інструмента: генерується лише обраний інструмент без міксу — менше тривалості аудіо й менше запитів.
Короткі лупи за BPM: тривалість доріжки розраховується динамічно (≈10 секунд, цілі такти при 4/4), без зайвих секунд.
Безшовне зациклення у браузері: Web Audio API лупить локально, не потрібно генерувати довгі версії або варіації.
Дедуплікація доріжок: не дозволяє додати однаковий інструмент повторно — уникаються повторні виклики до API.
Збереження стану: доріжки й історія зберігаються, що зменшує ризик «перегенерацій» після перезавантаження.
Промпт без «порожнин»: старт із першої мілісекунди, без count‑in/інтро/тиші та без fade — жодного зайвого кадру.
Контроль темпу без пересотворення: при зміні BPM попереджає, наявні доріжки не регенеруються.
Оптимальний формат: MP3 44.1k/128kbps — економить трафік і пришвидшує завантаження без повторних запитів.
Стійке розпізнавання голосу: синоніми/варіації (EN/RU) зменшують «порожні» спроби генерації.


This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
