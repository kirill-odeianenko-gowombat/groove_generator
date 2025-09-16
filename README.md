## Для чего сделан этот грув
Приложение создаёт компактную, синхронную ритм‑секцию, чтобы пользователь мог параллельно играть на своём инструменте (гитара и др.), импровизировать и ощущать себя в составе виртуальной группы. Вся «рутинная» сборка остальных партий не отвлекает: вы фокусируетесь только на игре.

## Описание приложения
Groove Generator — это веб‑приложение на Next.js для быстрого создания многослойных музыкальных грувов. Вы добавляете инструменты голосом или кнопками (например, “jazz drums”, “rock guitar”), и приложение с помощью ElevenLabs генерирует отдельные треки каждого инструмента (без подмешивания других), синхронизированные по темпу и предназначенные для бесшовной зацикливания.
Основная идея: послойно собирать грув из изолированных партий инструментов (ударные, бас, гитара, пиано, саксофон, труба, маракасы).
Голосовое управление: поддержка английских и русских команд через webkitSpeechRecognition.
Генерация музыки (AI): запросы к https://api.elevenlabs.io/v1/music/compose с длительностью, рассчитанной под выбранный BPM и размер 4/4 для цельных музыкальных фраз; вывод MP3 44.1kHz/128kbps.
Плеер и синхронный старт: Web Audio API для идеально бесшовных лупов и синхронного воспроизведения всех треков; fallback на HTML5 audio при необходимости.
Управление треками: mute/unmute, удаление, старт/стоп всех; история действий.
Темп: выбор BPM и пресеты; показ рассчитанной длительности в тактах/секундах; предупреждение при смене темпа с уже добавленными треками.
Сохранение состояния: треки хранятся в localStorage и восстанавливаются после перезагрузки.
Технологии: Next.js 15 (App Router), React 19, Tailwind CSS 4, Framer Motion, Lucide Icons; требуется NEXT_PUBLIC_ELEVEN_API_KEY для генерации музыки.

## Фишки экономии токенов и затрат
Изолированная генерация инструмента: генерируется только выбранный инструмент без микса — меньше времени аудио и меньше запросов.
Короткие лупы по BPM: длительность трека рассчитывается динамически (≈10 секунд, целые такты при 4/4), без лишних секунд.
Бесшовное зацикливание в браузере: Web Audio API лупит локально, не нужно генерировать длинные версии или вариации.
Дедупликация треков: не позволяет добавить одинаковый инструмент повторно — избегаются повторные вызовы к API.
Сохранение состояния: треки и история сохраняются, что снижает риск «перегенераций» после перезагрузки.
Промпт без «пустот»: обязателен старт с первой миллисекунды, без count‑in/интро/тишины и без fade — ни один лишний кадр.
Контроль темпа без пересоздания: при смене BPM предупреждает, существующие треки не регенерируются.
Оптимальный формат: MP3 44.1k/128kbps — экономит трафик и ускоряет загрузку без повторных запросов.
Устойчивое распознавание голоса: синонимы/вариации (EN/RU) уменьшают «пустые» попытки генерации.


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
