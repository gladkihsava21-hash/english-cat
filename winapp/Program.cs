// Савелий — приложение для Windows.
//
// Это тонкая оболочка над сайтом: окно + WebView2 (движок Edge, он уже
// стоит в Windows 10/11). Весь продукт — сайт wordcat.ru; здесь только
// рамка: размер окна под телефонную ориентацию, заголовок из страницы,
// внешние ссылки — в браузер. Если сайт обновится, приложение подхватит
// само — перевыпускать его не нужно.

using System;
using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;

namespace Savely.App
{
    internal static class Program
    {
        private const string HomeUrl = "https://wordcat.ru/";

        [STAThread]
        private static void Main()
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new MainWindow());
        }

        private sealed class MainWindow : Form
        {
            private readonly WebView2 web = new WebView2 { Dock = DockStyle.Fill };

            public MainWindow()
            {
                Text = "Савелий — кот-репетитор английского";
                // Портретная рамка, как у телефона: manifest сайта задан
                // portrait, и интерфейс на это рассчитан.
                StartPosition = FormStartPosition.CenterScreen;
                Size = new Size(460, 900);
                MinimumSize = new Size(380, 640);
                Controls.Add(web);
                Load += async (s, e) =>
                {
                    await web.EnsureCoreWebView2Async();
                    web.CoreWebView2.Navigate(HomeUrl);
                    web.CoreWebView2.DocumentTitleChanged += (s2, e2) =>
                        Text = string.IsNullOrEmpty(web.CoreWebView2.DocumentTitle)
                            ? "Савелий — кот-репетитор английского"
                            : web.CoreWebView2.DocumentTitle;
                    // Внешние ссылки (документы, источники фото) открываем в
                    // настоящем браузере — приложение про занятия.
                    web.CoreWebView2.NewWindowRequested += (s2, e2) =>
                    {
                        e2.Handled = true;
                        try { System.Diagnostics.Process.Start(
                            new System.Diagnostics.ProcessStartInfo(e2.Uri) { UseShellExecute = true }); }
                        catch { /* нет браузера — просто не откроется */ }
                    };
                };
            }
        }
    }
}
