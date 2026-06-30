import { Redis } from '@upstash/redis';

// เชื่อมต่อฐานข้อมูล Upstash Redis (Vercel จะดึง Token ให้อัตโนมัติ)
const redis = Redis.fromEnv(); 

export default async function handler(req, res) {
    const sessionId = req.query.sessionId || (req.body && req.body.sessionId);

    if (!sessionId) {
        return res.status(400).json({ reply: 'ข้อผิดพลาด: ไม่พบ Session ID' });
    }

    // 🟢 ฝั่ง GET: ดึงประวัติแชทตอนโหลดหน้าเว็บ
    if (req.method === 'GET') {
        try {
            const history = await redis.get(`chat:${sessionId}`) || [];
            return res.status(200).json({ history });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // 🔵 ฝั่ง POST: คุยกับ Gemini และเซฟประวัติ
    if (req.method === 'POST') {
        try {
            const { message, systemInstruction } = req.body;
            
            // ดึง Key ของ Gemini จากระบบ Vercel
            const apiKey = process.env.GEMINI_API_KEY; 

            if (!apiKey) return res.status(500).json({ reply: 'ไม่พบ GEMINI_API_KEY ใน Vercel' });

            // 1. ดึงประวัติแชทเก่าจากฐานข้อมูล
            let history = await redis.get(`chat:${sessionId}`) || [];

            // 2. จัดเตรียมโครงสร้างให้ Gemini (ต้องเป็น role: "user" และ "model")
            const contents = [];
            history.forEach(msg => {
                contents.push({
                    role: msg.role === "user" ? "user" : "model",
                    parts: [{ text: msg.parts[0].text }]
                });
            });
            
            // ใส่คำถามล่าสุด
            contents.push({ role: "user", parts: [{ text: message }] });

            const requestBody = { contents: contents };
            
            // ใส่ System Role (ถ้ามี)
            if (systemInstruction) {
                requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
            }

            // 3. ยิง API ไปที่โมเดลของ Google
            const modelName = 'gemini-3.1-flash-lite';
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                return res.status(500).json({ reply: `Gemini API Error: ${data.error?.message || 'Unknown Error'}` });
            }

            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                const reply = data.candidates[0].content.parts[0].text;
                
                // 4. อัปเดตประวัติแชทใหม่แล้วเซฟทับลงฐานข้อมูล
                history.push({ role: "user", parts: [{ text: message }] });
                history.push({ role: "model", parts: [{ text: reply }] });
                
                await redis.set(`chat:${sessionId}`, history);

                return res.status(200).json({ reply });
            } else {
                return res.status(500).json({ reply: 'โครงสร้างข้อมูลจาก Google API ไม่ถูกต้อง' });
            }

        } catch (error) {
            return res.status(500).json({ reply: `Server Error: ${error.message}` });
        }
    }

    return res.status(405).json({ reply: 'Method not allowed' });
}
