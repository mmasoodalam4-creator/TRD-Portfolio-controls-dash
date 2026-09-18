' =====================================================================
'  TAZAYUD OWNER PMO - INTEGRATED CONTROLS SYSTEM
'  Add / Remove Project macros  (v2 - testing phase, no sheet locks)
'  Paste this ENTIRE file into ONE module (Alt+F11 -> Insert -> Module),
'  or File -> Import File -> select this .bas
' =====================================================================

Option Explicit

' Registers that carry one linked block per project.
' Array(SheetName, firstDataRow, rowsPerProject)
Private Function RegList() As Variant
    RegList = Array( _
        Array("WBS_Register", 9, 9), Array("Cost_Financials", 70, 11), _
        Array("Variation_Orders", 9, 3), Array("Change_Log", 9, 3), _
        Array("Procurement_Register", 9, 4), Array("Manpower_Register", 9, 6), _
        Array("Equipment_Register", 9, 4), Array("Quality_Register", 9, 1), _
        Array("HSE_Register", 9, 1), Array("Risk_Register", 9, 4), _
        Array("Issues_Register", 9, 4), Array("Monthly_Trend", 9, 24), _
        Array("Projects", 9, 1))
End Function

' ---------------------------------------------------------------------
'  PUBLIC MACRO 1 - assign to the ADD NEW PROJECT button
'  Reads the three cream cells on the Projects add-panel:
'     C25 = new ID, I25 = new Name, Q25 = Portfolio (dropdown)
' ---------------------------------------------------------------------
Sub AddProject()
    Dim pj As Worksheet: Set pj = ThisWorkbook.Sheets("Projects")
    Dim pid As String, pName As String, pf As String
    Dim tmpl As Worksheet, newSht As Worksheet, i As Long
    Dim regs As Variant: regs = RegList()

    pid = Trim(CStr(pj.Range("C25").Value))
    pName = Trim(CStr(pj.Range("I25").Value))
    pf = Trim(CStr(pj.Range("Q25").Value))

    If pid = "" Then MsgBox "Enter a Project ID in the cream cell (C25).", vbExclamation: Exit Sub
    If pf = "" Then MsgBox "Pick a Portfolio from the dropdown (Q25).", vbExclamation: Exit Sub
    If SheetExists("PT_" & pid) Then MsgBox "A template for " & pid & " already exists.", vbExclamation: Exit Sub

    Application.ScreenUpdating = False

    ' 1. Copy the hidden master template to a new PT_ sheet
    Set tmpl = ThisWorkbook.Sheets("PT_TEMPLATE")
    tmpl.Visible = xlSheetVisible
    tmpl.Copy After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count)
    Set newSht = ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count)
    newSht.Name = "PT_" & pid
    tmpl.Visible = xlSheetHidden

    ' 2. Seed identity cells (correct cells: D7=ID, D8=Name, J7=Portfolio)
    newSht.Range("D7").Value = pid
    newSht.Range("D8").Value = pName
    newSht.Range("J7").Value = pf

    ' 3. Clone a linked block into every register
    For i = LBound(regs) To UBound(regs)
        Call CloneRegisterBlock(CStr(regs(i)(0)), CLng(regs(i)(1)), CLng(regs(i)(2)), pid)
    Next i

    ' 4. Extend the Master_Tracker project summary block
    Call CloneMasterRow(pid)

    ' 5. Rebuild the dropdown source list
    Call RefreshProjectLists

    ' 6. Clear the input panel
    pj.Range("C25").ClearContents
    pj.Range("I25").ClearContents
    pj.Range("Q25").ClearContents

    Application.ScreenUpdating = True
    MsgBox "Project " & pid & " added." & vbCrLf & _
           "Fill its cream cells on sheet PT_" & pid & "; every consolidated sheet updates automatically.", _
           vbInformation
End Sub

' ---------------------------------------------------------------------
'  PUBLIC MACRO 2 - assign to the REMOVE PROJECT button
'  Reads the project to remove from cell C28 (dropdown).
' ---------------------------------------------------------------------
Sub RemoveProject()
    Dim pj As Worksheet: Set pj = ThisWorkbook.Sheets("Projects")
    Dim pid As String, i As Long
    Dim regs As Variant: regs = RegList()

    pid = Trim(CStr(pj.Range("C28").Value))
    If pid = "" Then MsgBox "Pick a project to remove from the dropdown (C28).", vbExclamation: Exit Sub
    If Not SheetExists("PT_" & pid) Then MsgBox "No template found for " & pid & ".", vbExclamation: Exit Sub
    If MsgBox("Permanently remove " & pid & " and all its data?", _
              vbYesNo + vbExclamation, "Confirm") <> vbYes Then Exit Sub

    Application.ScreenUpdating = False

    ' 1. Delete the project block from every register
    For i = LBound(regs) To UBound(regs)
        Call DeleteRegisterBlock(CStr(regs(i)(0)), CLng(regs(i)(1)), CLng(regs(i)(2)), pid)
    Next i

    ' 2. Delete its row from the Master_Tracker project block
    Call DeleteMasterRow(pid)

    ' 3. Delete the template sheet
    Application.DisplayAlerts = False
    ThisWorkbook.Sheets("PT_" & pid).Delete
    Application.DisplayAlerts = True

    ' 4. Rebuild the dropdown source list, clear the panel
    Call RefreshProjectLists
    pj.Range("C28").ClearContents

    Application.ScreenUpdating = True
    MsgBox pid & " removed from every sheet and dropdown.", vbInformation
End Sub

' =====================================================================
'  HELPERS  (called by the macros - do not assign to buttons)
' =====================================================================
Private Function SheetExists(nm As String) As Boolean
    Dim s As Worksheet
    On Error Resume Next
    Set s = ThisWorkbook.Sheets(nm)
    SheetExists = Not s Is Nothing
    On Error GoTo 0
End Function

' ---- register block clone / delete ----------------------------------
Private Sub CloneRegisterBlock(sh As String, firstRow As Long, n As Long, pid As String)
    ' Inserts the new block WITHIN the existing data range (at the top of the last
    ' block) so that every summary SUMPRODUCT range auto-extends, then copies the
    ' pushed-down last block into the gap and repoints it at the new template.
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets(sh)
    Dim lastTop As Long, srcTop As Long, r As Long, blocks As Long, oldPid As String
    blocks = CountBlocks(ws, firstRow, n)
    If blocks = 0 Then Exit Sub
    lastTop = firstRow + (blocks - 1) * n          ' top of the current last block
    ws.Rows(lastTop & ":" & (lastTop + n - 1)).Insert Shift:=xlDown
    srcTop = lastTop + n                           ' the old last block, now pushed down
    ws.Rows(srcTop & ":" & (srcTop + n - 1)).Copy
    ws.Rows(lastTop & ":" & (lastTop + n - 1)).PasteSpecial xlPasteAll
    Application.CutCopyMode = False
    oldPid = CStr(ws.Cells(srcTop, 1).Value)
    For r = lastTop To lastTop + n - 1
        ws.Cells(r, 1).Value = pid
        ReplaceInRow ws, r, "PT_" & oldPid, "PT_" & pid
    Next r
End Sub

Private Sub DeleteRegisterBlock(sh As String, firstRow As Long, n As Long, pid As String)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets(sh)
    Dim r As Long: r = firstRow
    Do While Len(CStr(ws.Cells(r, 1).Value)) > 0 And _
             InStr(UCase(CStr(ws.Cells(r, 1).Value)), "TOTAL") = 0
        If CStr(ws.Cells(r, 1).Value) = pid Then
            ws.Rows(r & ":" & (r + n - 1)).Delete Shift:=xlUp
            Exit Do
        End If
        r = r + n
    Loop
End Sub

Private Function CountBlocks(ws As Worksheet, firstRow As Long, n As Long) As Long
    Dim c As Long, r As Long: r = firstRow
    Do While Len(CStr(ws.Cells(r, 1).Value)) > 0 And _
             InStr(UCase(CStr(ws.Cells(r, 1).Value)), "TOTAL") = 0
        c = c + 1: r = r + n
    Loop
    CountBlocks = c
End Function

Private Sub ReplaceInRow(ws As Worksheet, r As Long, findTxt As String, replTxt As String)
    Dim c As Range
    For Each c In ws.Range(ws.Cells(r, 1), ws.Cells(r, 40))
        If c.HasFormula Then c.Formula = Replace(c.Formula, findTxt, replTxt)
    Next c
End Sub

' ---- Master_Tracker project-summary block ---------------------------
'  The block starts at row 52 (header "Project ID" is at row 51) and ends
'  at the row whose column A contains "CORPORATE TOTAL". Each row pulls
'  from Projects!<col>$<row>. We clone the last row and repoint its
'  Projects row reference to the new (last) Projects data row.
Private Sub CloneMasterRow(pid As String)
    Dim mt As Worksheet: Set mt = ThisWorkbook.Sheets("Master_Tracker")
    Dim topRow As Long, totalRow As Long, lastRow As Long, newRow As Long
    Dim newProjRow As Long, oldProjRow As Long, r As Long, c As Range
    topRow = 52
    totalRow = FindRowText(mt, 1, topRow, "CORPORATE TOTAL")
    If totalRow = 0 Then Exit Sub
    lastRow = totalRow - 1
    newProjRow = 9 + CountBlocks(ThisWorkbook.Sheets("Projects"), 9, 1) - 1
    oldProjRow = 9 + (lastRow - topRow)          ' Projects row the last MT row points at
    ' insert WITHIN the block (at lastRow); copy the pushed-down old last row into the gap
    mt.Rows(lastRow & ":" & lastRow).Insert Shift:=xlDown
    mt.Rows((lastRow + 1) & ":" & (lastRow + 1)).Copy
    mt.Rows(lastRow & ":" & lastRow).PasteSpecial xlPasteAll
    Application.CutCopyMode = False
    newRow = lastRow
    ' repoint Projects row reference to the new (last) Projects data row
    For Each c In mt.Range(mt.Cells(newRow, 1), mt.Cells(newRow, 40))
        If c.HasFormula Then
            c.Formula = Replace(c.Formula, "$" & oldProjRow & "", "$" & newProjRow & "")
        End If
    Next c
End Sub

Private Sub DeleteMasterRow(pid As String)
    Dim mt As Worksheet: Set mt = ThisWorkbook.Sheets("Master_Tracker")
    Dim topRow As Long, totalRow As Long, r As Long
    topRow = 52
    totalRow = FindRowText(mt, 1, topRow, "CORPORATE TOTAL")
    If totalRow = 0 Then Exit Sub
    For r = topRow To totalRow - 1
        If CStr(mt.Cells(r, 1).Value) = pid Then
            mt.Rows(r & ":" & r).Delete Shift:=xlUp
            Exit Sub
        End If
    Next r
End Sub

Private Function FindRowText(ws As Worksheet, col As Long, fromRow As Long, txt As String) As Long
    Dim r As Long: r = fromRow
    Do While r < fromRow + 500
        If InStr(UCase(CStr(ws.Cells(r, col).Value)), UCase(txt)) > 0 Then
            FindRowText = r: Exit Function
        End If
        r = r + 1
    Loop
    FindRowText = 0
End Function

' ---- dropdown source list ------------------------------------------
Private Sub RefreshProjectLists()
    Dim s As Worksheet, lst As Worksheet, k As Long
    On Error Resume Next: Set lst = ThisWorkbook.Sheets("Lists"): On Error GoTo 0
    If lst Is Nothing Then Exit Sub
    lst.Range("A2:A500").ClearContents
    k = 2
    For Each s In ThisWorkbook.Worksheets
        If Left(s.Name, 3) = "PT_" And s.Name <> "PT_TEMPLATE" Then
            lst.Cells(k, 1).Value = Mid(s.Name, 4): k = k + 1
        End If
    Next s
End Sub
