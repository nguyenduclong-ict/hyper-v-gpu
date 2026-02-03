param (
    [string]$VMName,
    [string]$GPUName,
    [float]$GPUResourceAllocationPercentage = 50
)

$ErrorActionPreference = 'Stop'

# Import Driver Copy Module
Import-Module "$PSScriptRoot\Add-VMGpuPartitionAdapterFiles.psm1" -ErrorAction Stop

# Helper Function to Assign GPU (Copied from CopyFilesToVM)
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

Write-Host "UPDATE_LOG: Starting GPU Update for VM: $VMName"

# 1. Stop VM if running
$vm = Get-VM -Name $VMName -ErrorAction Stop
if ($vm.State -eq 'Running') {
    Write-Host "UPDATE_LOG: Stopping VM..."
    Stop-VM -Name $VMName -Force
}

# 2. Remove Existing GPU Partition
Write-Host "UPDATE_LOG: Removing existing GPU partition..."
Remove-VMGpuPartitionAdapter -VMName $VMName -ErrorAction SilentlyContinue

# 3. Add New GPU Partition
Write-Host "UPDATE_LOG: Assigning new GPU: $GPUName ($GPUResourceAllocationPercentage%)..."
Assign-VMGPUPartitionAdapter -VMName $VMName -GPUName $GPUName -GPUResourceAllocationPercentage $GPUResourceAllocationPercentage

# 4. Copy Driver Files
Write-Host "UPDATE_LOG: Mounting VHD to copy drivers..."
$vhdPath = (Get-VMHardDiskDrive -VMName $VMName).Path
if (-not $vhdPath) {
    Throw "Could not find VHD path for VM: $VMName"
}

$mountResult = Mount-DiskImage -ImagePath $vhdPath -StorageType VHD
$driveLetter = ($mountResult | Get-Volume).DriveLetter

if (-not $driveLetter) {
    # Try to assign a letter if none 
    # (Simplified logic, assumes mount worked but maybe no letter assigned automatically?)
    # For now, throw if failed.
    Dismount-DiskImage -ImagePath $vhdPath | Out-Null
    Throw "Failed to get Drive Letter for VHD: $vhdPath"
}

$driveLetterStr = "$($driveLetter):"
Write-Host "UPDATE_LOG: VHD Mounted at $driveLetterStr. Copying drivers..."

try {
    Add-VMGpuPartitionAdapterFiles -DriveLetter $driveLetterStr -GPUName $GPUName
    Write-Host "UPDATE_LOG: Drivers copied successfully."
}
catch {
    Write-Error "Failed to copy drivers: $_"
    # Continue to dismount even if copy fails
}
finally {
    Write-Host "UPDATE_LOG: Dismounting VHD..."
    Dismount-DiskImage -ImagePath $vhdPath | Out-Null
}

Write-Host "UPDATE_LOG: GPU Update Complete."
Write-Host "UPDATE_SUCCESS"
