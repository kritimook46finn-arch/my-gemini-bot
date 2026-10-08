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
            const { message, systemInstruction, model } = req.body;
            
            // ⭐️ 1. ดึง API Keys ทั้ง 2 ตัวจาก Vercel (ถ้ามี 3-4 ตัวก็เติมลูกน้ำต่อยอดได้เลย)
            const apiKeys = [
                process.env.GEMINI_API_KEY,    // Key ตัวที่ 1 (ตัวหลัก)
                process.env.GEMINI_API_KEY_2   // Key ตัวที่ 2 (ตัวสำรอง)
            ].filter(Boolean); // คำสั่งนี้ช่วยกรองอันที่ว่างเปล่าทิ้งไป

            if (apiKeys.length === 0) {
                return res.status(500).json({ reply: 'ไม่พบ API KEY ใน Vercel' });
            }

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

            const modelName = model || 'gemini-3.1-flash-lite';
            
            let data;
            let isSuccess = false;
            let lastError = '';

            // ⭐️ 2. ระบบวนลูป ลองใช้ API Key ทีละตัว
            for (let i = 0; i < apiKeys.length; i++) {
                const currentKey = apiKeys[i];
                
                try {
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${currentKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });

                    data = await response.json();

                    // ถ้า Response โอเค และไม่มี Error จาก Google
                    if (response.ok && !data.error) {
                        isSuccess = true;
                        break; // เจอ Key ที่ใช้ได้แล้ว สั่งหยุดลูปทันที
                    } else {
                        // ถ้าเจอ Error (เช่น ติด Limit) ให้เก็บข้อความไว้ และให้ลูปหมุนไปใช้ Key ตัวถัดไป
                        lastError = data.error?.message || 'Unknown API Error';
                        console.log(`Key ${i + 1} Failed: ${lastError}. สลับไปลองคีย์ถัดไป...`);
                    }
                } catch (fetchError) {
                    lastError = fetchError.message;
                    console.log(`Key ${i + 1} Network Error: ${lastError}. สลับไปลองคีย์ถัดไป...`);
                }
            }

            // ⭐️ 3. ถ้าวนลองจนครบทุกคีย์แล้วพังหมด ค่อยส่ง Error กลับไปให้ผู้ใช้เห็น
            if (!isSuccess) {
                return res.status(500).json({ reply: `Gemini API Error (ทุกคีย์เต็มหมดแล้ว): ${lastError}` });
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
