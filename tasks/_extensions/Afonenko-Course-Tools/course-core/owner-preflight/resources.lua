-- Body-only native Link/Image facts. Projection is the production Core projection.
local M={}
local function uses(doc,coverage)
  local rows=pandoc.List()
  local opaque=pandoc.List()
  local consumed,ordinal={},0
  for _,carrier in ipairs(coverage or {}) do
    assert(not consumed[carrier.ordinal],'SOURCE.NATIVE_LISTING_UNSUPPORTED: duplicate raw occurrence')
    consumed[carrier.ordinal]=carrier
  end
  local function raw(raw)
    if raw.format~='html' then return end
    ordinal=ordinal+1
    local carrier=consumed[ordinal]
    if carrier then
      assert(carrier.kind==raw.t and carrier.format==raw.format and carrier.text==raw.text,
        'SOURCE.NATIVE_LISTING_UNSUPPORTED: resource carrier traversal differs')
      consumed[ordinal]=nil
    else opaque:insert(raw.t..':html') end
  end
  local function walk(fragment,cell,display)
    fragment:walk({traverse='topdown',Div=function(div)
      walk(pandoc.Pandoc(div.content),cell or div.classes:includes('cell'),display or div.classes:includes('cell-output-display'))
      return div,false
    end,RawBlock=raw,RawInline=raw,Link=function(link)
      rows:insert({kind='Link',target=link.target,order=#rows+1,nativePlot=false})
    end,Image=function(image)
      rows:insert({kind='Image',target=image.src,order=#rows+1,nativePlot=cell and display})
    end})
  end
  walk(pandoc.Pandoc(doc.blocks),false,false)
  assert(next(consumed)==nil,'SOURCE.NATIVE_LISTING_UNSUPPORTED: unvisited resource carrier')
  return rows,opaque
end
function M.collect(doc,context,project,listing)
  local projected=listing and listing.projectedDoc or project(doc:clone())
  local raw,opaque=uses(doc,listing and listing.rawCoverage)
  local permitted=uses(projected,listing and listing.projectedCoverage)
  local result={source=context.source,profile=context.profile,phase=context.phase,effectiveBase=context.effectiveBase,
    outputDirectory=context.outputDirectory,outputFile=context.outputFile,raw=raw,projected=permitted,opaque=opaque}
  -- Native profile references and surviving canonical anchors share this exact
  -- projection, including controls and solutions. No source-text link scan.
  result.canonicalIds=pandoc.List()
  result.references=pandoc.List()
  projected:walk({Div=function(div)
    if div.identifier:match('^exr%-') or div.identifier:match('^sol%-') then result.canonicalIds:insert(div.identifier) end
  end,Cite=function(cite)
    for _,ref in ipairs(cite.citations) do
      if ref.id:match('^exr%-') or ref.id:match('^sol%-') then result.references:insert({id=ref.id,target=ref.id}) end
    end
  end,Link=function(link)
    if not link.target:match('^[%a][%w+.-]*:') and not link.target:match('^//') then
      local id=link.target:match('#(exr%-.+)$') or link.target:match('#(sol%-.+)$')
      if id then result.references:insert({id=id,target=link.target}) end
    end
  end})
  if listing then
    result.nativeListingWitness=listing.nativeListingWitness
    result.nativeListingAddresses=listing.nativeListingAddresses
  end
  return result
end
return M
