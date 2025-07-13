import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderFile } from 'ejs';

// Get the current directory name using import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const generatePdf = async (templatePath, data, outputPath) => {
    try {
        // Construct the full path to the EJS template
        const fullTemplatePath = path.join(__dirname, '..', '..', templatePath);
        
        // Render the EJS template with the provided data
        const html = await renderFile(fullTemplatePath, data);

        // Launch a headless browser
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Set the HTML content of the page
        await page.setContent(html, { waitUntil: 'networkidle0' });

        // Generate the PDF with background graphics
        await page.pdf({ path: outputPath, format: 'A4', printBackground: true });

        await browser.close();
        console.log(`PDF generated successfully at ${outputPath}`);
        return outputPath;
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw error;
    }
};

export default generatePdf;
