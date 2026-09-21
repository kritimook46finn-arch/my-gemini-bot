import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv(); 

export default async function handler(req, res) {
    const sessionId = req.query.sessionId || (req.body && req.body.sessionId);

    if (!sessionId) {
        return res.status(400).json({ reply: 'ข้อผิดพลาด: ไม่พบ Session ID' });
    }

    if (req.method === 'GET') {
        try {
            const history = await redis.get(`chat:${sessionId}`) || [];
            return res.status(200).json({ history });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            await redis.del(`chat:${sessionId}`);
            return res.status(200).json({ success: true, message: 'ลบประวัติเรียบร้อย' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            // รับค่า model ที่ผู้ใช้เลือกจากหน้าเว็บมาด้วย
            const { message, systemInstruction, model } = req.body;
            const apiKey = process.env.GEMINI_API_KEY; 

            if (!apiKey) return res.status(500).json({ reply: 'ไม่พบ GEMINI_API_KEY ใน Vercel' });

            let history = await redis.get(`chat:${sessionId}`) || [];

            const contents = [];
            history.forEach(msg => {
                contents.push({
                    role: msg.role === "user" ? "user" : "model",
                    parts: [{ text: msg.parts[0].text }]
                });
            });
            
            contents.push({ role: "user", parts: [{ text: message }] });

            const requestBody = { contents: contents };
            if (systemInstruction) {
                requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
            }

            // ใช้ model ที่ส่งมา ถ้าไม่มีให้ใช้ 3.1 เป็นค่าเริ่มต้น
            const modelName = model || 'gemini-3.1-flash-lite';
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
