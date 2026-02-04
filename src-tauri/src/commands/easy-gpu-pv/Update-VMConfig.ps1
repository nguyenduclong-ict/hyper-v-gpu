param (
    [string]$VMName,
    [string]$GPUName,
    [float]$GPUResourceAllocationPercentage = 50,
    [int]$ProcessorCount,
    [long]$MemoryMB,
    [string]$NetworkSwitch
)

$ErrorActionPreference = 'Stop'

# Import Driver Copy Module
Import-Module "$PSScriptRoot\Add-VMGpuPartitionAdapterFiles.psm1" -ErrorAction Stop

# Helper Function to Assign GPU
function Assign-VMGPUPartitionAdapter {
param(
[string]$VMName,
[string]$GPUName,
[decimal]$GPUResourceAllocationPercentage = 100
)
    $PartitionableGPUList = Get-WmiObject -Class "Msvm_PartitionableGpu" -ComputerName $env:COMPUTERNAME -Namespace "ROOT\virtualization\v2" 
    if ($GPUName -eq "AUTO") {
        $DevicePathName = $PartitionableGPUList.Name[0]
        Add-VMGpuPartitionAdapter -VMName $VMName
        }
    else {
        # Find hardware ID for specific GPU
        $DeviceID = ((Get-WmiObject Win32_PNPSignedDriver | where {($_.Devicename -eq "$GPUName")}).hardwareid).split('\')[1]
        $DevicePathName = ($PartitionableGPUList | Where-Object name -like "*$deviceid*").Name
        Add-VMGpuPartitionAdapter -VMName $VMName -InstancePath $DevicePathName
        }

    [float]$devider = [math]::round($(100 / $GPUResourceAllocationPercentage),2)

    # Set Resource Allocation
    Set-VMGpuPartitionAdapter -VMName $VMName -MinPartitionVRAM ([math]::round($(1000000000 / $devider))) -MaxPartitionVRAM ([math]::round($(1000000000 / $devider))) -OptimalPartitionVRAM ([math]::round($(1000000000 / $devider)))
    Set-VMGPUPartitionAdapter -VMName $VMName -MinPartitionEncode ([math]::round($(18446744073709551615 / $devider))) -MaxPartitionEncode ([math]::round($(18446744073709551615 / $devider))) -OptimalPartitionEncode ([math]::round($(18446744073709551615 / $devider)))
    Set-VMGpuPartitionAdapter -VMName $VMName -MinPartitionDecode ([math]::round($(1000000000 / $devider))) -MaxPartitionDecode ([math]::round($(1000000000 / $devider))) -OptimalPartitionDecode ([math]::round($(1000000000 / $devider)))
    Set-VMGpuPartitionAdapter -VMName $VMName -MinPartitionCompute ([math]::round($(1000000000 / $devider))) -MaxPartitionCompute ([math]::round($(1000000000 / $devider))) -OptimalPartitionCompute ([math]::round($(1000000000 / $devider)))
}

Write-Host "UPDATE_LOG: Starting Configuration Update for VM: $VMName"

# 1. Stop VM if running
$vm = Get-VM -Name $VMName -ErrorAction Stop
if ($vm.State -eq 'Running') {
    Write-Host "UPDATE_LOG: Stopping VM..."
    Stop-VM -Name $VMName -Force
    
    # Wait for VM to actually be Off
    $maxWait = 20
    $count = 0
    do {
        Start-Sleep -Seconds 1
        $currentParams = Get-VM -Name $VMName
        $count++
    } while ($currentParams.State -eq 'Running' -and $count -lt $maxWait)
    
    # Force Kill any zombie VMWP processes
    $vmId = (Get-VM -Name $VMName).Id.Guid
    Write-Host "UPDATE_LOG: Checking for zombie VMWP processes (ID: $vmId)..."
    $vmwp = Get-WmiObject Win32_Process | Where-Object { $_.Name -eq 'vmwp.exe' -and $_.CommandLine -like "*$vmId*" }
    if ($vmwp) {
        Write-Host "UPDATE_LOG: Found zombie VMWP process (PID: $($vmwp.ProcessId)). Terminating..."
        Stop-Process -Id $vmwp.ProcessId -Force -ErrorAction SilentlyContinue
    }

    # Extra safety grace period
    Start-Sleep -Seconds 5
}

# 2. Update CPU
if ($ProcessorCount -gt 0) {
    Write-Host "UPDATE_LOG: Setting Processor Count to $ProcessorCount..."
    Set-VM -Name $VMName -ProcessorCount $ProcessorCount
}

# 3. Update Memory
if ($MemoryMB -gt 0) {
    Write-Host "UPDATE_LOG: Setting Memory to ${MemoryMB}MB..."
    # Disable Dynamic Memory for GPU stability usually, using StartupBytes ensures static assignment if configured so.
    Set-VMMemory -VMName $VMName -StartupBytes ($MemoryMB * 1MB)
}

# 4. Update Network Switch (optional check if changed)
if ($NetworkSwitch -and $NetworkSwitch -ne "") {
    Write-Host "UPDATE_LOG: Connecting to Switch '$NetworkSwitch'..."
    $adapter = Get-VMNetworkAdapter -VMName $VMName
    if ($adapter) {
        Connect-VMNetworkAdapter -VMNetworkAdapter $adapter -SwitchName $NetworkSwitch
    } else {
        Write-Warning "No Network Adapter found on VM to connect."
    }
}

# 5. Update GPU (Always run if GPUName provided, to ensure partition settings)
if ($GPUName) {
    # Remove Existing GPU Partition
    Write-Host "UPDATE_LOG: Removing existing GPU partition..."
    Remove-VMGpuPartitionAdapter -VMName $VMName -ErrorAction SilentlyContinue

    # Enforce GPU-PV Compatible Settings (Critical for Manual VMs)
    Write-Host "UPDATE_LOG: Enforcing GPU-PV compatible hardware settings (MMIO, Cache)..."
    Set-VM -Name $VMName -LowMemoryMappedIoSpace 3GB -HighMemoryMappedIoSpace 32GB -GuestControlledCacheTypes $true -CheckpointType Disabled
    Set-VMProcessor -VMName $VMName -ExposeVirtualizationExtensions $true
    Set-VMMemory -VMName $VMName -DynamicMemoryEnabled $false
    Set-VMKeyProtector -VMName $VMName -NewLocalKeyProtector -ErrorAction SilentlyContinue # Ensure Keys exist
    
    # Add New GPU Partition
    Write-Host "UPDATE_LOG: Assigning new GPU: $GPUName ($GPUResourceAllocationPercentage%)..."
    Assign-VMGPUPartitionAdapter -VMName $VMName -GPUName $GPUName -GPUResourceAllocationPercentage $GPUResourceAllocationPercentage

    # Copy Driver Files (Heavy operation)
    Write-Host "UPDATE_LOG: Mounting VHD to copy drivers..."
    $vhdPath = (Get-VMHardDiskDrive -VMName $VMName).Path
    if (-not $vhdPath) {
        Throw "Could not find VHD path for VM: $VMName"
    }

    try {
        # Check if already mounted using Get-VHD (Hyper-V module checked implicitly by usage)
        $alreadyMounted = (Get-DiskImage -ImagePath $vhdPath -ErrorAction SilentlyContinue).Attached
        
        if ($alreadyMounted) {
             Write-Host "UPDATE_LOG: VHD is already mounted. Using existing mount..."
             # Try to get disk number from existing mount
             $disk = Get-DiskImage -ImagePath $vhdPath | Get-Disk
        } else {
             # Cleanup known stale handles
             Dismount-VHD -Path $vhdPath -ErrorAction SilentlyContinue | Out-Null
        }

        if (-not $alreadyMounted) {
            $maxRetries = 5
            $retryCount = 0
            $mountSuccess = $false
            
            while (-not $mountSuccess -and $retryCount -lt $maxRetries) {
                try {
                    # Switch to Mount-VHD (Hyper-V Cmdlet) with Passthru to get Disk Info
                    $mountResult = Mount-VHD -Path $vhdPath -Passthru -ErrorAction Stop
                    $diskNumber = $mountResult.DiskNumber
                    $mountSuccess = $true
                }
                catch {
                    Write-Host "UPDATE_LOG: Mount-VHD failed, retrying in 5s... ($($retryCount+1)/$maxRetries)"
                    Start-Sleep -Seconds 5
                    $retryCount++
                    Dismount-VHD -Path $vhdPath -ErrorAction SilentlyContinue | Out-Null
                }
            }
            if (-not $mountSuccess) {
                Throw "Failed to mount VHD after $maxRetries attempts using Mount-VHD."
            }
            
            # Get Disk Object from Number
            if ($diskNumber) {
                $disk = Get-Disk -Number $diskNumber
            }
        }
        
        # Ensure we have a disk object
        if (-not $disk) {
            # Fallback try to find it
            Start-Sleep -Seconds 2
            $disk = Get-DiskImage -ImagePath $vhdPath -ErrorAction SilentlyContinue | Get-Disk
        }
        
        if (-not $disk) {
            Throw "Could not Identify Disk Object for VHD: $vhdPath"
        }

        # Ensure Disk is Online and Writable
        if ($disk.IsOffline -or $disk.IsReadOnly) {
            Set-Disk -InputObject $disk -IsOffline $false -IsReadOnly $false -ErrorAction SilentlyContinue
        }

        # Retrieve Volume info - wait for it to appear
        $driveLetter = $null
        $maxVolRetries = 10
        $volRetry = 0
        
        while (-not $driveLetter -and $volRetry -lt $maxVolRetries) {
            $part = $disk | Get-Partition | Where-Object { $_.DriveLetter }
            if ($part) {
                $driveLetter = $part.DriveLetter
            } else {
                # Try to assign if valid partition exists but no letter
                $part = $disk | Get-Partition | Where-Object { $_.Type -eq 'Basic' -or $_.Type -eq 'IFS' } | Select-Object -First 1
                if ($part) {
                     try {
                        Set-Partition -InputObject $part -NewDriveLetter Y -ErrorAction SilentlyContinue
                        $driveLetter = 'Y'
                     } catch {
                        # Ignore assignment errors, maybe it just appeared
                     }
                }
                
                if (-not $driveLetter) {
                    Start-Sleep -Seconds 1
                    $volRetry++
                    # Refresh disk object
                    $disk = Get-Disk -Number $disk.Number
                }
            }
        }

        if (-not $driveLetter) {
             Throw "Failed to get Drive Letter for VHD: $vhdPath (DiskNum: $($disk.Number))"
        }
        
        # Format drive letter char to string X:
        if ($driveLetter -is [char]) {
            $driveLetterStr = "$($driveLetter):"
        } else {
             $driveLetterStr = "$($driveLetter):"
        }
        
        Write-Host "UPDATE_LOG: VHD Mounted at $driveLetterStr. Copying drivers..."
        Add-VMGpuPartitionAdapterFiles -DriveLetter $driveLetterStr -GPUName $GPUName
        Write-Host "UPDATE_LOG: Drivers copied successfully."
    }
    catch {
        Write-Error "Failed to copy drivers: $_"
    }
    finally {
        Write-Host "UPDATE_LOG: Dismounting VHD..."
        Dismount-VHD -Path $vhdPath -ErrorAction SilentlyContinue | Out-Null
    }
}

Write-Host "UPDATE_LOG: Update Complete."
Write-Host "UPDATE_SUCCESS"
