import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // รับ Session ID ว่าใครกำลังคุยอยู่
    const sessionId = req.query.sessionId || (req.body && req.body.sessionId);

    if (!sessionId) {
        return res.status(400).json({ reply: 'ข้อผิดพลาด: ไม่พบ Session ID' });
    }

    // 🟢 ฝั่ง GET: ใช้สำหรับดึงประวัติแชทตอนเปิดหน้าเว็บขึ้นมาใหม่
    if (req.method === 'GET') {
        try {
            // ดึงข้อมูลจากฐานข้อมูล ถ้าไม่มีให้คืนค่า Array ว่าง
            const history = await kv.get(`chat:${sessionId}`) || [];
            return res.status(200).json({ history });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // 🔵 ฝั่ง POST: รับข้อความใหม่ ยิงหา AI และเซฟลงฐานข้อมูล
    if (req.method === 'POST') {
        try {
            const { message, systemInstruction } = req.body;
            const apiKey = process.env.GROQ_API_KEY; 

            if (!apiKey) return res.status(500).json({ reply: 'ไม่พบ GROQ_API_KEY' });

            // 1. ดึงประวัติแชทเดิมของคนๆ นี้จาก Vercel KV
            let history = await kv.get(`chat:${sessionId}`) || [];

            // 2. จัดเตรียมรูปแบบข้อความส่งให้ Groq
            const messages = [];
            if (systemInstruction) {
                messages.push({ role: "system", content: systemInstruction });
            }
            
            // แปลงประวัติเก่าให้เข้าโครงสร้าง API
            history.forEach(msg => {
                messages.push({ 
                    role: msg.role === "user" ? "user" : "assistant", 
                    content: msg.parts[0].text 
                });
            });
            
            // ใส่ข้อความล่าสุดของผู้ใช้
            messages.push({ role: "user", content: message });

            // 3. ยิง API หา Groq (llama-3.1-8b-instant)
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
                    messages: messages,
                    temperature: 0.7
                })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                return res.status(500).json({ reply: `Groq API Error: ${data.error?.message}` });
            }

            if (data.choices && data.choices[0] && data.choices[0].message) {
                const reply = data.choices[0].message.content;
                
                // 4. เอาคำถามและคำตอบใหม่ ยัดใส่ประวัติ แล้วอัปเดตทับลง Vercel KV
                history.push({ role: "user", parts: [{ text: message }] });
                history.push({ role: "model", parts: [{ text: reply }] });
                
                await kv.set(`chat:${sessionId}`, history);

                // คืนค่าแค่คำตอบ AI กลับไปให้หน้าเว็บ
                return res.status(200).json({ reply });
            } else {
                return res.status(500).json({ reply: 'โครงสร้างข้อมูลจาก Groq ไม่ถูกต้อง' });
            }

        } catch (error) {
            return res.status(500).json({ reply: `Server Error: ${error.message}` });
        }
    }

    return res.status(405).json({ reply: 'Method not allowed' });
}
