export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ reply: 'Method not allowed' });
    }

    try {
        // รับ history และ systemInstruction มาจาก Frontend
        const { history, systemInstruction } = req.body;
        const apiKey = process.env.GEMINI_API_KEY; 

        if (!apiKey) {
            return res.status(500).json({ reply: 'ข้อผิดพลาด: ไม่พบ API Key บน Vercel' });
        }
        
        // โครงสร้าง Request Body สำหรับส่งให้ Gemini แบบมีความจำและบทบาท
        const requestBody = {
            contents: history // ส่งประวัติการคุยทั้งหมดไป
        };

        // ถ้าผู้ใช้มีการพิมพ์กำหนดบทบาทมา ให้ใส่เพิ่มเข้าไปในระบบ
        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (data.error) {
            return res.status(500).json({ reply: `Google API Error: ${data.error.message}` });
        }

        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            const reply = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: 'โครงสร้างข้อมูลจาก Google API ไม่ถูกต้อง' });
        }

    } catch (error) {
        return res.status(500).json({ reply: `เกิดข้อผิดพลาดฝั่ง Server: ${error.message}` });
    }
}
