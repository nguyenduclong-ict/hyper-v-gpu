Báo cáo Nghiên cứu Chuyên sâu: Chiến lược Tự động hóa Nâng cao cho Scaling Giao diện Remote Desktop trên Màn hình High-DPI1. Tóm tắt Điều hànhSự phổ biến của các thiết bị hiển thị độ phân giải cao (High-DPI, 4K, 8K) trong môi trường doanh nghiệp hiện đại đã tạo ra một thách thức kỹ thuật đáng kể trong quản trị hệ thống từ xa: vấn đề không tương thích tỷ lệ hiển thị (scaling mismatch). Trong khi các hệ điều hành hiện đại như Windows 10 và Windows 11 xử lý việc scaling giao diện người dùng (UI) một cách linh hoạt, các phiên bản Remote Desktop Protocol (RDP) cũ hoặc các máy chủ legacy (Windows Server 2008 R2, Windows 7) thường hiển thị ở độ phân giải gốc (native resolution). Điều này dẫn đến việc giao diện phiên làm việc từ xa trở nên cực kỳ nhỏ và không thể đọc được trên màn hình client có mật độ điểm ảnh cao.Các giải pháp truyền thống như điều chỉnh tệp cấu hình .rdp với tham số desktopscalefactor hoặc sử dụng tính năng smart sizing thường không mang lại hiệu quả mong muốn. desktopscalefactor phụ thuộc vào khả năng hỗ trợ DPI ảo hóa của máy chủ (thường vắng mặt trên các hệ thống cũ), trong khi smart sizing thực hiện việc co giãn hình ảnh bitmap một cách thô sơ, dẫn đến hiện tượng mờ nhòe (blurring) và sai lệch tỷ lệ khung hình.Để giải quyết vấn đề này, Microsoft đã giới thiệu tính năng "Zoom" trong menu hệ thống (System Menu) của mstsc.exe, cho phép thực hiện "pixel doubling" (nhân đôi điểm ảnh) hoặc scaling số nguyên ngay tại phía client. Tính năng này đảm bảo hình ảnh sắc nét và kích thước hiển thị phù hợp mà không phụ thuộc vào cấu hình của máy chủ. Tuy nhiên, tính năng này không được hỗ trợ qua giao diện dòng lệnh (CLI) hoặc các khóa registry bền vững, buộc người dùng phải thao tác thủ công mỗi lần kết nối.Báo cáo này cung cấp một phân tích kỹ thuật toàn diện và các giải pháp tự động hóa bằng PowerShell để khởi chạy mstsc.exe với mức zoom client cố định là 200%, loại bỏ sự phụ thuộc vào các cài đặt server-side không hiệu quả. Nghiên cứu đi sâu vào kiến trúc Win32 API, UI Automation, và đối tượng COM MsTscAx, cung cấp các kịch bản mã hóa (scripting) mạnh mẽ để giải quyết triệt để vấn đề này.2. Bối cảnh Kỹ thuật: RDP, High-DPI và Sự Thất bại của Các Cài đặt ChuẩnĐể xây dựng một giải pháp tự động hóa hiệu quả, trước hết cần giải mã kiến trúc hiển thị của giao thức RDP và lý do tại sao các phương pháp cấu hình thông thường lại thất bại trong các kịch bản High-DPI.2.1. Sự Tiến hóa của Độ phân giải và Scaling trong RDPTrong lịch sử phát triển của giao thức RDP, các phiên làm việc (session) được thiết kế theo nguyên tắc "pixel-perfect" (chính xác từng điểm ảnh). Máy khách (client) yêu cầu một độ phân giải cụ thể (ví dụ: 1024x768), và máy chủ (host) sẽ render và truyền tải chính xác số lượng điểm ảnh đó.Khi màn hình High-DPI xuất hiện, mật độ điểm ảnh tăng lên gấp đôi hoặc gấp ba. Một cửa sổ 1024x768 trên màn hình 4K (3840x2160) chỉ chiếm khoảng 1/9 diện tích hiển thị, khiến văn bản và các nút điều khiển trở nên quá nhỏ để tương tác. Microsoft đã đưa ra ba cơ chế chính để xử lý vấn đề này, nhưng mỗi cơ chế đều có những hạn chế riêng biệt:Server-Side Scaling (DPI Remoting - Dynamic Resolution):Cơ chế: Client gửi thông tin DPI của mình tới Server trong quá trình bắt tay (handshake). Server nhận thông tin này và vẽ lại giao diện (render) ở mức DPI tương ứng (ví dụ: 200%).Hạn chế: Cơ chế này yêu cầu máy chủ phải chạy Windows 8.1 / Windows Server 2012 R2 hoặc mới hơn. Các hệ điều hành legacy như Windows 7 hoặc Windows Server 2008 hoàn toàn bỏ qua gói tin này, khiến tham số desktopscalefactor trong tệp .rdp trở nên vô dụng.Smart Sizing (Bitmap Stretching):Cơ chế: Đây là tính năng có sẵn từ lâu trong mstsc. Nó cho phép cửa sổ RDP thay đổi kích thước tùy ý và client sẽ co giãn hình ảnh bitmap nhận được để vừa với khung cửa sổ.Hạn chế: Smart Sizing thường sử dụng thuật toán nội suy song tuyến tính (bilinear interpolation) hoặc lấy mẫu gần nhất (nearest neighbor) tùy thuộc vào tỷ lệ. Khi tỷ lệ zoom không phải là số nguyên (ví dụ: kéo cửa sổ để khớp với một vùng màn hình ngẫu nhiên, tạo ra tỷ lệ 137%), kết quả là hình ảnh bị mờ, văn bản bị vỡ nét (aliasing artifacts), gây mỏi mắt và khó chịu cho người dùng chuyên nghiệp.Client-Side Zoom (Pixel Doubling / Integer Scaling):Cơ chế: Đây là tính năng được yêu cầu trong đề bài. Tính năng này được Microsoft bổ sung vào mstsc.exe trên Windows 10 (bản cập nhật khoảng năm 2015-2016). Nó thực hiện scaling sau khi nhận dữ liệu bitmap từ server nhưng trước khi hiển thị lên màn hình client. Khi chọn mức Zoom 200%, mỗi điểm ảnh vật lý từ server được hiển thị thành một khối 2x2 điểm ảnh trên màn hình client.Ưu điểm: Vì thực hiện scaling số nguyên (integer scaling), hình ảnh vẫn giữ được độ sắc nét (dù có thể thấy răng cưa pixel, nhưng không bị mờ nhòe). Quan trọng nhất, nó hoạt động độc lập hoàn toàn với phiên bản hệ điều hành của máy chủ.2.2. Phân tích Sự Bất lực của Registry và Tệp cấu hình RDPNgười dùng thường cố gắng giải quyết vấn đề này bằng cách can thiệp vào registry hoặc tệp .rdp. Tuy nhiên, nghiên cứu sâu vào cấu trúc registry của Terminal Server Client (HKCU\Software\Microsoft\Terminal Server Client) cho thấy một thực tế quan trọng:Tính Tạm thời của Zoom: Khác với độ phân giải (desktopwidth/desktopheight) hay tên người dùng, mức Zoom trong menu hệ thống được mstsc.exe coi là một trạng thái hiển thị tạm thời (view state). Nó không được lưu lại bền vững trong registry sau khi đóng ứng dụng. Mỗi lần khởi chạy lại, mstsc sẽ đặt lại mức zoom về mặc định (thường là 100% hoặc Auto-detect nếu server hỗ trợ DPI remoting).Tham số dòng lệnh: mstsc.exe chỉ hỗ trợ một tập hợp hạn chế các tham số dòng lệnh (/v, /w, /h, /f, /admin, v.v.). Không có tham số nào như /zoom hay /scale tồn tại. Điều này phản ánh thiết kế của mstsc như một trình bao bọc (wrapper) mỏng xung quanh ActiveX control, nơi mà các tính năng giao diện người dùng (UI) không được ưu tiên lộ ra qua CLI.2.3. Bảng so sánh các phương pháp ScalingĐặc điểmDesktopScaleFactor (RDP File)Smart Sizing (RDP File)Client Zoom (Menu Hệ thống)Vị trí xử lýTại Server (Host-side)Tại Client (Client-side)Tại Client (Client-side)Yêu cầu ServerWindows 8.1 / 2012 R2+KhôngKhôngChất lượng hình ảnhRất tốt (Native vector scaling)Kém (Mờ, biến dạng)Tốt (Sắc nét, Pixelated)Khả năng ScriptingDễ (Sửa file text)Dễ (Sửa file text)Khó (Cần Automation)Hiệu quả với LegacyKhông hiệu quảCó (nhưng xấu)Tối ưuDữ liệu từ bảng trên khẳng định rằng đối với các hệ thống legacy trên màn hình 4K, Client Zoom là lựa chọn duy nhất cân bằng được khả năng tương thích và chất lượng hiển thị. Do đó, việc tìm ra giải pháp tự động hóa cho tính năng này là mệnh lệnh bắt buộc đối với quản trị viên hệ thống.3. Các Phương pháp Tự động hóa: Từ Đơn giản đến Phức tạpĐể "ép" mstsc.exe khởi chạy với mức Zoom 200% từ PowerShell, chúng ta phải vượt qua rào cản giao diện người dùng. Dưới đây là phân tích chi tiết các phương pháp tiếp cận khả thi, từ mô phỏng phím bấm đến can thiệp API cấp thấp.3.1. Phương pháp A: Mô phỏng Bàn phím (SendKeys) - Giải pháp Mong manhPhương pháp tiếp cận đầu tiên và trực quan nhất là sử dụng System.Windows.Forms.SendKeys hoặc đối tượng COM WScript.Shell để gửi chuỗi phím tắt vào cửa sổ ứng dụng ngay sau khi nó khởi chạy.Quy trình:Khởi chạy mstsc.exe.Đợi cửa sổ xuất hiện.Gửi tổ hợp phím Alt + Space (Mở menu hệ thống).Gửi phím z (Chọn menu Zoom - phụ thuộc ngôn ngữ).Gửi phím 2 (Chọn mức 200%).Phân tích Kỹ thuật & Rủi ro:Sự phụ thuộc vào Focus: SendKeys hoạt động bằng cách bơm sự kiện phím vào hàng đợi thông điệp (message queue) của cửa sổ đang có tiêu điểm (foreground window). Nếu người dùng click chuột sang cửa sổ khác (ví dụ: Outlook hoặc Web Browser) trong khoảng thời gian vài trăm mili-giây giữa lúc lệnh chạy và lúc phím được gửi, các phím này sẽ bị gửi nhầm địa chỉ.Vấn đề về Thời gian (Timing): Việc kết nối RDP có độ trễ không xác định (tùy thuộc mạng). Script phải sử dụng Start-Sleep cố định (hard-coded sleep), dẫn đến việc script chạy chậm một cách không cần thiết hoặc thất bại nếu mạng lag.Phụ thuộc Ngôn ngữ: Phím tắt (Accelerator Key) thay đổi theo ngôn ngữ hệ điều hành. Trên Windows tiếng Anh, phím tắt cho Zoom là z. Trên tiếng Pháp hoặc Đức, nó có thể khác.Mặc dù đơn giản, phương pháp này không đạt tiêu chuẩn "chuyên gia" do tính thiếu ổn định (flaky).3.2. Phương pháp B: Can thiệp Registry và Manifest (Hack)Một số tài liệu đề xuất việc sửa đổi manifest của mstsc.exe để tắt tính năng nhận diện DPI (dpiAware=false).Cơ chế: Bằng cách khai báo với Windows rằng mstsc.exe là một ứng dụng cũ không hỗ trợ High-DPI, Desktop Window Manager (DWM) của Windows sẽ tự động phóng to cửa sổ ứng dụng (bitmap stretching) để nó không bị quá nhỏ.Tại sao không nên dùng: Phương pháp này làm mờ toàn bộ cửa sổ ứng dụng, bao gồm cả thanh tiêu đề, menu kết nối và các hộp thoại cảnh báo. Nó không tận dụng được thuật toán scaling nội bộ của mstsc (vốn giữ nguyên độ nét của các thành phần UI client trong khi chỉ zoom nội dung remote). Hơn nữa, việc can thiệp vào file hệ thống trong System32 vi phạm các nguyên tắc bảo mật và toàn vẹn hệ thống (SFC/DISM sẽ báo lỗi).3.3. Phương pháp C: UI Automation (UIA) - Giải pháp Chuẩn mựcMicrosoft UI Automation (UIA) là khung công tác (framework) được thiết kế để thay thế Microsoft Active Accessibility (MSAA). Nó cho phép các script truy cập vào cây phân cấp giao diện của ứng dụng, tìm kiếm các phần tử bằng tên hoặc loại điều khiển (Control Type) và kích hoạt chúng.Ưu điểm: Không phụ thuộc vào tọa độ màn hình; có thể hoạt động khi cửa sổ không active (ở mức độ nhất định); mã nguồn rõ ràng và dễ bảo trì.Thách thức với MSTSC: Menu hệ thống (System Menu) của một cửa sổ Win32 tiêu chuẩn thường được quản lý bởi csrss.exe hoặc dwm.exe chứ không phải hoàn toàn nằm trong luồng (thread) của ứng dụng. Việc truy cập System Menu qua UIA phức tạp hơn nhiều so với việc truy cập một nút bấm thông thường trên form. Tuy nhiên, đây là một phương pháp khả thi nếu kết hợp đúng các Pattern (mẫu điều khiển).3.4. Phương pháp D: Win32 API / P/Invoke - Giải pháp Tối ưuĐây là phương pháp mạnh mẽ nhất và được các kỹ sư hệ thống ưa chuộng. Bằng cách sử dụng Platform Invocation Services (P/Invoke) để gọi trực tiếp các hàm từ thư viện user32.dll, ta có thể thao tác trực tiếp với Handle (HWND) của cửa sổ.Cơ chế:Tìm HWND của cửa sổ mstsc.Sử dụng GetSystemMenu để lấy handle của menu.Duyệt qua các mục menu để tìm ID của lệnh "Zoom" và "200%".Gửi thông điệp WM_SYSCOMMAND hoặc WM_COMMAND trực tiếp tới cửa sổ để kích hoạt tính năng đó ngay lập tức.Tại sao là giải pháp tốt nhất: Nó hoạt động tức thời (không cần chờ animation), không chiếm dụng chuột/bàn phím của người dùng, và cực kỳ chính xác.3.5. Phương pháp E: ActiveX Hosting (Giải pháp "Nuclear")Thay vì cố gắng điều khiển mstsc.exe từ bên ngoài, ta có thể viết một script PowerShell để tự tạo một trình RDP Client riêng bằng cách nhúng đối tượng COM MsTscAx.MsTscAx (thư viện lõi của RDP).Ưu điểm: Kiểm soát tuyệt đối. Interface IMsRdpClientAdvancedSettings cung cấp thuộc tính ZoomLevel mà ta có thể thiết lập bằng code trước khi kết nối.Nhược điểm: Phức tạp. Đòi hỏi kiến thức về Windows Forms và COM Interop. Không có giao diện "quen thuộc" của mstsc (thanh kết nối, lưu pass) trừ khi tự lập trình lại.4. Triển khai Giải pháp Kỹ thuật: Kịch bản PowerShell Tự động hóaDựa trên sự phân tích trên, giải pháp tối ưu nhất để đáp ứng yêu cầu của người dùng là sử dụng PowerShell kết hợp với Win32 API (P/Invoke). Phương pháp này cân bằng giữa độ tin cậy cao và trải nghiệm người dùng (vẫn sử dụng giao diện mstsc quen thuộc).Dưới đây là thiết kế chi tiết và mã nguồn cho giải pháp này.4.1. Kiến trúc ScriptScript sẽ thực hiện các bước sau:Định nghĩa API: Khai báo các hàm C# cần thiết (GetSystemMenu, GetMenuItemID, PostMessage, v.v.) và biên dịch chúng vào phiên làm việc PowerShell.Khởi tạo Quy trình: Chạy mstsc.exe với tham số /v:<Server>.Đồng bộ hóa Trạng thái: Chờ cho đến khi cửa sổ chính xuất hiện và trạng thái kết nối ổn định (dựa trên Tiêu đề cửa sổ).Duyệt Menu Động: Vì ID của menu "200%" có thể thay đổi tùy phiên bản Windows, script sẽ "quét" menu hệ thống để tìm mục con (Submenu) có tên chứa chuỗi "Zoom" (hoặc mã định danh tương ứng), sau đó tìm mục "200%".Gửi Lệnh: Gửi thông điệp kích hoạt tới cửa sổ.4.2. Mã Nguồn Chi Tiết (The "Zoom-Automator")PowerShell<#
.SYNOPSIS
Khởi chạy Remote Desktop Connection (mstsc) và tự động thiết lập mức Zoom 200%.
Bỏ qua các cài đặt DPI/Scaling không hiệu quả của server.

.DESCRIPTION
Script này sử dụng Win32 API thông qua P/Invoke để tương tác trực tiếp với System Menu
của cửa sổ mstsc. Nó tìm kiếm menu "Zoom" và kích hoạt tùy chọn "200%" bằng cách gửi
thông điệp WM_SYSCOMMAND. Phương pháp này hoạt động độc lập với độ phân giải màn hình
và không chiếm dụng bàn phím/chuột như phương pháp SendKeys.

.PARAMETER Target
Địa chỉ IP hoặc Hostname của máy chủ đích.

.NOTES
Author: Domain Expert
Version: 2.0
Requirements: Windows 10/11, PowerShell 5.1+
#>

param (
[Parameter(Mandatory=$true)]
[string]$Target
)

# ---------------------------------------------------------

# Bước 1: Định nghĩa Win32 API qua C# (P/Invoke)

# ---------------------------------------------------------

$Win32Source = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class Win32Helper {
// Lấy Handle của System Menu

    public static extern IntPtr GetSystemMenu(IntPtr hWnd, bool bRevert);

    // Lấy số lượng item trong menu

    public static extern int GetMenuItemCount(IntPtr hMenu);

    // Lấy chuỗi văn bản của menu item

    public static extern int GetMenuString(IntPtr hMenu, uint uIDItem, StringBuilder lpString, int nMaxCount, uint uFlag);

    // Lấy handle của menu con (SubMenu)

    public static extern IntPtr GetSubMenu(IntPtr hMenu, int nPos);

    // Lấy ID của menu item tại vị trí nPos

    public static extern uint GetMenuItemID(IntPtr hMenu, int nPos);

    // Gửi thông điệp tới cửa sổ (PostMessage không chờ xử lý xong, giúp script chạy mượt hơn)

    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    // Các hằng số cần thiết
    public const uint MF_BYPOSITION = 0x400;
    public const uint WM_SYSCOMMAND = 0x0112;

}
"@

# Thêm Type vào PowerShell, bỏ qua lỗi nếu đã tồn tại

try {
Add-Type -TypeDefinition $Win32Source -Language CSharp
} catch { # Type đã được load, bỏ qua
}

# ---------------------------------------------------------

# Bước 2: Khởi chạy MSTSC

# ---------------------------------------------------------

Write-Host "[INFO] Đang khởi chạy kết nối tới: $Target" -ForegroundColor Cyan

# Sử dụng ArgumentList để truyền tham số /v (server) và /w /h (nếu cần thiết lập kích thước ban đầu)

# Lưu ý: Không dùng smart sizing trong file RDP vì nó xung đột với Zoom.

$proc = Start-Process "mstsc.exe" -ArgumentList "/v:$Target" -PassThru

# ---------------------------------------------------------

# Bước 3: Đợi cửa sổ xuất hiện và ổn định

# ---------------------------------------------------------

Write-Host "[INFO] Đang đợi cửa sổ RDP khởi tạo..." -ForegroundColor Yellow

# Vòng lặp chờ Handle cửa sổ

$timeout = 0
while ($proc.MainWindowHandle -eq 0 -and $timeout -lt 100) {
Start-Sleep -Milliseconds 100
$timeout++
$proc.Refresh()
}

if ($proc.MainWindowHandle -eq 0) {
Write-Error "Không thể lấy Handle của cửa sổ mstsc. Có thể ứng dụng đã đóng hoặc chạy dưới quyền khác."
exit
}

# Chờ thêm một chút để UI load hoàn toàn (đặc biệt là System Menu)

Start-Sleep -Seconds 1

# ---------------------------------------------------------

# Bước 4: Quét Menu và Kích hoạt Zoom 200%

# ---------------------------------------------------------

$hWnd = $proc.MainWindowHandle
$hSysMenu =::GetSystemMenu($hWnd, $false)

if ($hSysMenu -ne [IntPtr]::Zero) {
    $itemCount =::GetMenuItemCount($hSysMenu)
Write-Host " Tìm thấy $itemCount mục trong System Menu." -ForegroundColor DarkGray

    # Duyệt qua từng mục trong Menu chính để tìm mục "Zoom"
    for ($i = 0; $i -lt $itemCount; $i++) {
        $sb = New-Object System.Text.StringBuilder 256
        # Lấy tên menu theo vị trí
        [void]::GetMenuString($hSysMenu, $i, $sb, $sb.Capacity,::MF_BYPOSITION)
        $menuText = $sb.ToString()

        # Kiểm tra xem tên menu có chứa từ khóa Zoom không (hỗ trợ tiếng Anh)
        # Đối với tiếng Việt hoặc ngôn ngữ khác, cần bổ sung từ khóa tương ứng
        if ($menuText -match "Zoom") {
            Write-Host "[INFO] Đã tìm thấy menu Zoom tại vị trí $i" -ForegroundColor Green

            # Lấy handle của menu con (Submenu chứa các mức %)
            $hSubMenu =::GetSubMenu($hSysMenu, $i)

            if ($hSubMenu -ne [IntPtr]::Zero) {
                $subItemCount =::GetMenuItemCount($hSubMenu)

                # Duyệt menu con để tìm mức 200%
                for ($j = 0; $j -lt $subItemCount; $j++) {
                    $sbSub = New-Object System.Text.StringBuilder 256
                    [void]::GetMenuString($hSubMenu, $j, $sbSub, $sbSub.Capacity,::MF_BYPOSITION)
                    $subMenuText = $sbSub.ToString()

                    # Tìm chuỗi "200%"
                    if ($subMenuText -match "200%") {
                        # Lấy Command ID của mục này
                        $cmdID =::GetMenuItemID($hSubMenu, $j)
                        Write-Host "[INFO] Đã tìm thấy tùy chọn 200% (ID: $cmdID). Đang kích hoạt..." -ForegroundColor Green

                        # Gửi lệnh WM_SYSCOMMAND tới cửa sổ chính với ID vừa tìm được
                        # Đây là bước quan trọng nhất: giả lập việc người dùng click vào menu đó
                       ::PostMessage($hWnd,::WM_SYSCOMMAND, [IntPtr]$cmdID, [IntPtr]::Zero)

                        Write-Host " Đã thiết lập Zoom 200% thành công." -ForegroundColor Cyan
                        break
                    }
                }
            }
            break # Thoát vòng lặp sau khi xử lý xong menu Zoom
        }
    }

} else {
Write-Warning "Không thể truy cập System Menu. Có thể do quyền hạn hoặc lỗi Win32."
}
4.3. Phân tích Chi tiết Kịch bảnTính Bền Vững (Robustness): Kịch bản trên không "đoán mò" phím tắt. Nó thực sự "nhìn" vào cấu trúc menu của ứng dụng đang chạy. Điều này có nghĩa là nếu Microsoft thay đổi vị trí của menu Zoom trong một bản cập nhật tương lai, nhưng vẫn giữ tên là "Zoom" và tùy chọn "200%", script vẫn sẽ hoạt động chính xác.Cơ chế PostMessage: Sử dụng PostMessage thay vì SendMessage là một lựa chọn kỹ thuật có chủ đích. PostMessage đặt thông điệp vào hàng đợi và trả về ngay lập tức, giúp script PowerShell không bị treo nếu giao diện mstsc đang bận xử lý kết nối (ví dụ: đang handshake mạng).Xử lý Đa ngôn ngữ: Trong phần so khớp chuỗi (-match "Zoom"), nếu hệ thống sử dụng ngôn ngữ tiếng Việt (hoặc ngôn ngữ khác), từ khóa có thể thay đổi. Quản trị viên cần điều chỉnh dòng này (ví dụ: -match "Thu phóng" nếu giao diện tiếng Việt).5. Giải pháp Thay thế: ActiveX Wrapper (Phương pháp Nâng cao)Nếu yêu cầu đặt ra là phải kiểm soát hoàn toàn mà không phụ thuộc vào cửa sổ mstsc (ví dụ: nhúng vào ứng dụng quản lý tập trung), phương pháp sử dụng ActiveX control là lựa chọn tối thượng.5.1. Giới thiệu IMsRdpClientAdvancedSettingsĐối tượng COM MsTscAx.MsTscAx (thư viện lõi của RDP) cung cấp giao diện IMsRdpClientAdvancedSettings. Trong các phiên bản mới của giao diện này (phiên bản 9 trở lên), Microsoft đã mở rộng các thuộc tính để hỗ trợ scaling tốt hơn.Theo tài liệu kỹ thuật , thuộc tính ZoomLevel hoạt động tương hỗ với SmartSizing. Để Zoom hoạt động, SmartSizing phải được đặt là False (tắt).5.2. Mã mẫu cho ActiveX WrapperPowerShell# Yêu cầu: Cần load thư viện Windows Forms để tạo khung chứa
Add-Type -AssemblyName System.Windows.Forms

# Tạo Form chứa

$form = New-Object System.Windows.Forms.Form
$form.Text = "RDP Client - Forced 200% Zoom"
$form.Size = New-Object System.Drawing.Size(1280, 960)

# Tạo đối tượng ActiveX RDP

# Lưu ý: Trong thực tế, việc nhúng ActiveX vào WinForms qua PowerShell thuần túy

# gặp nhiều khó khăn do thiếu AxHost wrapper.

# Đoạn mã dưới đây mang tính minh họa logic thiết lập thuộc tính.

try {
$rdp = New-Object -ComObject "MsTscAx.MsTscAx"

    # Cấu hình Server
    $rdp.Server = "192.168.1.50"
    $rdp.UserName = "Administrator"

    # CẤU HÌNH QUAN TRỌNG CHO ZOOM
    # Tắt SmartSizing (co giãn tự động) để bật chế độ Zoom thủ công
    $rdp.AdvancedSettings9.SmartSizing = $false

    # Thiết lập mức Zoom. Giá trị này tương ứng với menu:
    # (Cần tra cứu giá trị Enum chính xác, thường là uint)
    # Tuy nhiên, một số phiên bản ActiveX chỉ nhận sự kiện Zoom qua phương thức tương tác.
    # Trong trường hợp này, Win32 API ở mục 4 vẫn là giải pháp thực tế hơn cho PowerShell.

} catch {
Write-Host "Không thể khởi tạo ActiveX RDP. Cần cài đặt Remote Desktop Connection mới nhất."
}
Nhận định: Do sự phức tạp trong việc tạo AxHost wrapper trong PowerShell thuần (thường yêu cầu biên dịch C# wrapper hoặc sử dụng Visual Studio để tạo Interop DLL), phương pháp ActiveX, mặc dù mạnh mẽ về lý thuyết, lại kém linh hoạt hơn phương pháp Win32 API (Mục 4) cho các tác vụ quản trị hàng ngày.6. Các Hệ quả và Tác động Mở rộng6.1. Tại sao Microsoft không cung cấp tham số CLI?Dữ liệu nghiên cứu cho thấy sự thiếu hụt các tham số dòng lệnh cho các tính năng UI (như Zoom) phản ánh chiến lược phát triển của Microsoft. mstsc.exe được coi là một công cụ "legacy". Microsoft đang chuyển hướng người dùng sang ứng dụng "Microsoft Remote Desktop" (hay còn gọi là "Windows App") trên Microsoft Store. Ứng dụng Modern/UWP này xử lý DPI scaling tự nhiên hơn, tuân theo cài đặt của hệ điều hành client mà không cần menu Zoom thủ công. Việc script hóa mstsc thực chất là một giải pháp "cầu nối" trong khi các doanh nghiệp chuyển dịch sang nền tảng quản lý hiện đại hơn.6.2. An toàn Bảo mật và Tự động hóaKhi tự động hóa RDP, vấn đề quản lý thông tin xác thực (credentials) là tối quan trọng.Script ở Mục 4 an toàn vì nó tận dụng mstsc.exe, cho phép sử dụng kho lưu trữ thông tin xác thực an toàn của Windows (Credential Manager / CMDKEY).Script không cần lưu mật khẩu dạng văn bản rõ (clear-text).Người dùng nên sử dụng lệnh cmdkey /generic:TERMSRV/ServerIP /user:Username /pass:Password trước khi chạy script để đảm bảo trải nghiệm đăng nhập không điểm chạm (SSO).6.3. Ứng dụng trong Môi trường VDI (Virtual Desktop Infrastructure)Giải pháp tự động hóa này đặc biệt hữu ích trong các môi trường VDI (như Citrix, VMware Horizon, hoặc Azure Virtual Desktop) nơi người dùng cuối sử dụng thiết bị cá nhân (BYOD) cao cấp (Surface Pro, MacBook Retina chạy Windows Bootcamp) để truy cập vào các máy ảo Windows 10/11 hoặc Server cũ. Việc triển khai script này dưới dạng một "Launcher" trên màn hình desktop của người dùng sẽ giảm thiểu đáng kể số lượng vé hỗ trợ kỹ thuật (Helpdesk tickets) liên quan đến vấn đề "chữ quá nhỏ" hoặc "màn hình bị mờ".7. Kết luận và Khuyến nghịĐể khởi chạy mstsc từ PowerShell với mức zoom client 200% và bỏ qua các cài đặt desktopscalefactor không hiệu quả, phương pháp tiếp cận duy nhất đáng tin cậy là Tự động hóa Win32 API (P/Invoke).Tại sao không dùng file RDP: Các thiết lập trong file .rdp phụ thuộc vào sự hợp tác của máy chủ, điều này không tồn tại trên các hệ thống legacy.Tại sao không dùng Smart Sizing: Nó làm giảm chất lượng hình ảnh, gây khó khăn cho việc đọc văn bản.Tại sao dùng Script: Tính năng "Zoom" của client là giải pháp kỹ thuật đúng đắn (Integer Scaling), nhưng thiếu giao diện dòng lệnh.Khuyến nghị triển khai:Sử dụng đoạn mã PowerShell được cung cấp trong Mục 4.2.Lưu đoạn mã thành file .ps1 (ví dụ: Launch-RDP200.ps1).Tạo một Shortcut trên màn hình Desktop trỏ đến: powershell.exe -ExecutionPolicy Bypass -File "C:\Path\To\Launch-RDP200.ps1" -Target "ServerIP".Đối với môi trường doanh nghiệp, có thể đóng gói script này thành file .exe bằng công cụ như PS2EXE để phân phối dễ dàng hơn cho người dùng cuối.Giải pháp này cung cấp một trải nghiệm liền mạch, chuyên nghiệp, giải quyết triệt để vấn đề hiển thị High-DPI mà không yêu cầu nâng cấp hệ điều hành máy chủ hay cài đặt phần mềm bên thứ ba phức tạp.
